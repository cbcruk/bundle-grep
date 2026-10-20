/**
 * Evaluates a {@linkcode FileExpr} against a repository.
 *
 * @module
 */

import { Result } from 'better-result'

import type { GitError } from '../git/git.errors'
import { runGit, splitNul } from '../git/run-git'
import { symbolMatcher } from '../symbols/match-symbols'
import { symbolIndex } from '../symbols/symbol-index'
import type { SymbolIndex, SymbolIndexError } from '../symbols/symbols.types'
import { grepArgs } from './grep-args'
import { matchesLanguage } from './match-path'
import type { FileExpr, LanguageLeaf, ListMatchingFilesOptions } from './plan.types'

type FileSet = Result<Set<string>, SymbolIndexError>

function escapeGlob(text: string): string {
  return text.replace(/[*?[\]\\]/g, '\\$&')
}

function languagePathspecs(leaf: LanguageLeaf): string[] {
  return [
    ...leaf.extensions.map(extension => `:(glob,icase)**/*${escapeGlob(extension)}`),
    ...leaf.filenames.map(filename => `:(glob,icase)**/${escapeGlob(filename)}`),
  ]
}

/**
 * Pathspecs that every matching file satisfies, for narrowing each `git grep`.
 *
 * Taken from the first top-level conjunct that is a `language:`, or an `OR` of
 * them. The expression still tests the language itself, so this only saves
 * work and never changes the answer.
 */
export function narrowingPathspecs(expr: FileExpr): string[] {
  const conjuncts = expr.op === 'and' ? expr.children : [expr]
  for (const conjunct of conjuncts) {
    if (conjunct.op === 'language') return languagePathspecs(conjunct)
    if (conjunct.op === 'or' && conjunct.children.every(child => child.op === 'language')) {
      return conjunct.children.flatMap(child => (child.op === 'language' ? languagePathspecs(child) : []))
    }
  }
  return []
}

function stripRef(paths: string[], ref: string): string[] {
  const prefix = `${ref}:`
  return paths.map(path => (path.startsWith(prefix) ? path.slice(prefix.length) : path))
}

/** More paths than this are checked for binary content by reading the whole tree once instead. */
const CHECK_LIMIT = 1000

/** Paths per `git grep` when checking named files, to stay well under the argument length limit. */
const CHECK_CHUNK = 250

interface TreeFiles {
  /** Every regular file in the tree, text or binary. */
  all: Set<string>
  /** The empty ones, which are text but which `git grep` never lists. */
  empty: Set<string>
}

/** Lists the regular files of a tree from `git ls-tree`, without reading any of them. */
async function listTreeFiles(gitDir: string, ref: string, signal: AbortSignal | undefined): Promise<Result<TreeFiles, GitError>> {
  const tree = await runGit(['ls-tree', '-r', '-l', '-z', ref], { cwd: gitDir, signal })
  return tree.map(({ stdout }) => {
    const files: TreeFiles = { all: new Set(), empty: new Set() }
    for (const entry of splitNul(stdout)) {
      const match = /^100(?:644|755) blob [0-9a-f]+ +(\d+)\t(.*)$/s.exec(entry)
      if (!match) continue
      files.all.add(match[2]!)
      if (match[1] === '0') files.empty.add(match[2]!)
    }
    return files
  })
}

/**
 * Lists which of some non-empty files `git grep -I` reads as text.
 *
 * A few files are named to git, so only they are read; many are found by
 * reading the whole tree once, which is cheaper than naming them all.
 */
async function textFiles(
  gitDir: string,
  ref: string,
  paths: readonly string[],
  signal: AbortSignal | undefined,
): Promise<Result<Set<string>, GitError>> {
  const grep = async (pathspecs: string[]): Promise<Result<string[], GitError>> => {
    const args = ['grep', '--no-color', '-I', '-l', '-z', '-e', '', ref, ...(pathspecs.length ? ['--', ...pathspecs] : [])]
    const result = await runGit(args, { cwd: gitDir, allowExitCodes: [1], signal })
    return result.map(({ stdout }) => stripRef(splitNul(stdout), ref))
  }
  const batches =
    paths.length > CHECK_LIMIT
      ? [[]]
      : Array.from({ length: Math.ceil(paths.length / CHECK_CHUNK) }, (_, index) =>
          paths.slice(index * CHECK_CHUNK, (index + 1) * CHECK_CHUNK).map(path => `:(literal)${path}`),
        )
  const text = new Set<string>()
  for (const result of await Promise.all(batches.map(grep))) {
    if (result.isErr()) return result
    for (const path of result.value) text.add(path)
  }
  return Result.ok(text)
}

/**
 * Lists the text files in a tree that an expression selects.
 *
 * Lists the tree's files once and runs one `git grep -l` per `grep` leaf,
 * then combines the sets in memory. `symbol:` leaves are answered from the
 * tree's symbol index, loaded once.
 *
 * Binary files match nothing — not even a `NOT` or a `path:` — as GitHub
 * does not index them. Files a `grep` or `symbol:` leaf found are text
 * already, so only the rest of the answer, such as the files a `path:`
 * selected, is read to tell them apart.
 *
 * @returns The matching paths, sorted, or the first failure: git's, or
 * tree-sitter's while building a symbol index.
 */
export async function listMatchingFiles(options: ListMatchingFilesOptions): Promise<Result<string[], SymbolIndexError>> {
  const { gitDir, expr, ref = 'HEAD', signal } = options
  const pathspecs = narrowingPathspecs(expr)
  let tree: Promise<Result<TreeFiles, GitError>> | undefined
  let symbols: Promise<Result<SymbolIndex, SymbolIndexError>> | undefined
  const known = new Set<string>()

  const treeFiles = (): Promise<Result<TreeFiles, GitError>> => {
    tree ??= listTreeFiles(gitDir, ref, signal)
    return tree
  }
  const allFiles = async (): Promise<FileSet> => (await treeFiles()).map(files => files.all)
  const found = (files: Set<string>): Set<string> => {
    for (const path of files) known.add(path)
    return files
  }

  const filterAll = async (test: (path: string) => boolean): Promise<FileSet> =>
    (await allFiles()).map(files => new Set([...files].filter(test)))

  const evaluate = async (node: FileExpr): Promise<FileSet> => {
    switch (node.op) {
      case 'all':
        return allFiles()
      case 'none':
        return Result.ok(new Set())
      case 'path': {
        const regex = new RegExp(node.regex, node.ignoreCase ? 'i' : '')
        return filterAll(path => regex.test(path))
      }
      case 'language':
        return filterAll(path => matchesLanguage(node, path))
      case 'symbol': {
        symbols ??= options.symbols ? Promise.resolve(Result.ok(options.symbols)) : symbolIndex(gitDir, { ref, signal })
        const matches = symbolMatcher([node])
        return (await symbols).map(index =>
          found(new Set([...index.files].filter(([, file]) => file.symbols.some(matches)).map(([path]) => path))),
        )
      }
      case 'grep': {
        const args = ['grep', '--no-color', '-l', '-z', '-I', ...grepArgs(node), ref, '--', ...pathspecs]
        const result = await runGit(args, { cwd: gitDir, allowExitCodes: [1], signal })
        return result.map(({ stdout }) => found(new Set(stripRef(splitNul(stdout), ref))))
      }
      case 'not': {
        const [files, excluded] = await Promise.all([allFiles(), evaluate(node.child)])
        if (files.isErr()) return files
        if (excluded.isErr()) return excluded
        return Result.ok(new Set([...files.value].filter(path => !excluded.value.has(path))))
      }
      case 'and':
      case 'or': {
        const sets: Set<string>[] = []
        for (const result of await Promise.all(node.children.map(evaluate))) {
          if (result.isErr()) return result
          sets.push(result.value)
        }
        const [first = new Set<string>(), ...rest] = sets
        return Result.ok(
          node.op === 'and'
            ? new Set([...first].filter(path => rest.every(set => set.has(path))))
            : new Set(sets.flatMap(set => [...set])),
        )
      }
    }
  }

  const matched = await evaluate(expr)
  if (matched.isErr()) return matched
  const unchecked = [...matched.value].filter(path => !known.has(path))
  if (unchecked.length === 0) return Result.ok([...matched.value].sort())

  const files = await treeFiles()
  if (files.isErr()) return files
  const nonEmpty = unchecked.filter(path => !files.value.empty.has(path))
  const text = await textFiles(gitDir, ref, nonEmpty, signal)
  if (text.isErr()) return text
  const binary = new Set(nonEmpty.filter(path => !text.value.has(path)))
  return Result.ok([...matched.value].filter(path => !binary.has(path)).sort())
}
