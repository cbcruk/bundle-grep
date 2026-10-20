/**
 * Evaluates a {@linkcode FileExpr} against a repository.
 *
 * @module
 */

import { Result } from 'better-result'

import type { GitError } from '../git/git.errors'
import { literalPathspecChunks } from '../git/literal-pathspecs'
import { runGit, splitNul } from '../git/run-git'
import { symbolMatcher } from '../symbols/match-symbols'
import { symbolIndex } from '../symbols/symbol-index'
import type { SymbolIndex, SymbolIndexError } from '../symbols/symbols.types'
import { grepArgs } from './grep-args'
import { matchesLanguage } from './match-path'
import type { FileExpr, LanguageLeaf, ListMatchingFilesOptions, TreeFiles } from './plan.types'

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

/** Lists the non-empty files `git grep -I` reads as text, among those the pathspecs name, or in the whole tree for none. */
async function grepTextFiles(
  gitDir: string,
  ref: string,
  pathspecs: readonly string[],
  signal: AbortSignal | undefined,
): Promise<Result<Set<string>, GitError>> {
  const args = ['grep', '--no-color', '-I', '-l', '-z', '-e', '', ref, ...(pathspecs.length ? ['--', ...pathspecs] : [])]
  const result = await runGit(args, { cwd: gitDir, allowExitCodes: [1], signal })
  return result.map(({ stdout }) => new Set(stripRef(splitNul(stdout), ref)))
}

/** Lists which of some non-empty files are text, naming them to git in runs that fit on a command line. */
async function namedTextFiles(
  gitDir: string,
  ref: string,
  paths: readonly string[],
  signal: AbortSignal | undefined,
): Promise<Result<Set<string>, GitError>> {
  const text = new Set<string>()
  for (const result of await Promise.all(literalPathspecChunks(paths).map(chunk => grepTextFiles(gitDir, ref, chunk, signal)))) {
    if (result.isErr()) return result
    for (const path of result.value) text.add(path)
  }
  return Result.ok(text)
}

function hasNot(expr: FileExpr): boolean {
  if (expr.op === 'not') return true
  return (expr.op === 'and' || expr.op === 'or') && expr.children.some(hasNot)
}

/**
 * Lists the text files in a tree that an expression selects.
 *
 * Lists the tree's files once and runs one `git grep -l` per `grep` leaf,
 * then combines the sets in memory. `symbol:` leaves are answered from the
 * tree's symbol index, loaded once.
 *
 * Binary files match nothing — not even a `NOT` or a `path:` — as GitHub
 * does not index them, and git decides which are binary, attributes
 * included. Files a `grep` leaf found are text already, so only the rest of
 * the answer, such as the files a `path:` selected, is read to tell them
 * apart: by name when there are few, and otherwise, or when a name is not
 * valid UTF-8 and cannot be named back to git, by reading the whole tree,
 * which starts at once for an expression with a `NOT`.
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
  const spare = new AbortController()
  const wholeTree = hasNot(expr)
    ? grepTextFiles(gitDir, ref, pathspecs, signal ? AbortSignal.any([signal, spare.signal]) : spare.signal)
    : undefined

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
        return (await symbols).map(
          index => new Set([...index.files].filter(([, file]) => file.symbols.some(matches)).map(([path]) => path)),
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

  try {
    const matched = await evaluate(expr)
    if (matched.isErr()) return matched
    const unchecked = [...matched.value].filter(path => !known.has(path))
    if (unchecked.length === 0) return Result.ok([...matched.value].sort())

    const files = await treeFiles()
    if (files.isErr()) return files
    const nonEmpty = unchecked.filter(path => !files.value.empty.has(path))
    const named = nonEmpty.length <= CHECK_LIMIT && !nonEmpty.some(path => path.includes('\uFFFD'))
    const text = await (wholeTree ??
      (named ? namedTextFiles(gitDir, ref, nonEmpty, signal) : grepTextFiles(gitDir, ref, pathspecs, signal)))
    if (text.isErr()) return text
    const binary = new Set(nonEmpty.filter(path => !text.value.has(path)))
    return Result.ok([...matched.value].filter(path => !binary.has(path)).sort())
  } finally {
    spare.abort()
  }
}
