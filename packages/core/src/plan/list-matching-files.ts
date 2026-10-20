/**
 * Evaluates a {@linkcode FileExpr} against a repository.
 *
 * @module
 */

import { Result } from 'better-result'

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

/**
 * Lists the text files of a tree: non-empty ones `git grep -I` reads, plus empty blobs.
 *
 * Binary files are left out of the universe, as GitHub does not index them,
 * so they match nothing — not even a `NOT` or a `path:`.
 */
async function listTextFiles(gitDir: string, ref: string, signal: AbortSignal | undefined): Promise<FileSet> {
  const [nonEmpty, tree] = await Promise.all([
    runGit(['grep', '--no-color', '-I', '-l', '-z', '-e', '', ref], { cwd: gitDir, allowExitCodes: [1], signal }),
    runGit(['ls-tree', '-r', '-l', '-z', ref], { cwd: gitDir, signal }),
  ])
  if (nonEmpty.isErr()) return nonEmpty
  if (tree.isErr()) return tree

  const files = new Set(stripRef(splitNul(nonEmpty.value.stdout), ref))
  for (const entry of splitNul(tree.value.stdout)) {
    const match = /^\d+ blob [0-9a-f]+ +0\t(.*)$/s.exec(entry)
    if (match) files.add(match[1]!)
  }
  return Result.ok(files)
}

/**
 * Lists the text files in a tree that an expression selects.
 *
 * Builds the tree's text-file list once and runs one `git grep -l` per `grep`
 * leaf, then combines the sets in memory. `symbol:` leaves are answered from
 * the tree's symbol index, loaded once.
 *
 * @returns The matching paths, sorted, or the first failure: git's, or
 * tree-sitter's while building a symbol index.
 */
export async function listMatchingFiles(options: ListMatchingFilesOptions): Promise<Result<string[], SymbolIndexError>> {
  const { gitDir, expr, ref = 'HEAD', signal } = options
  const pathspecs = narrowingPathspecs(expr)
  let universe: Promise<FileSet> | undefined
  let symbols: Promise<Result<SymbolIndex, SymbolIndexError>> | undefined

  const allFiles = (): Promise<FileSet> => {
    universe ??= listTextFiles(gitDir, ref, signal)
    return universe
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
        return result.map(({ stdout }) => new Set(stripRef(splitNul(stdout), ref)))
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

  return (await evaluate(expr)).map(files => [...files].sort())
}
