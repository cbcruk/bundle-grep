/**
 * Evaluates a {@linkcode FileExpr} against a repository.
 *
 * @module
 */

import { Result } from 'better-result'

import type { GitError } from '../git/git.errors'
import { runGit, splitNul } from '../git/run-git'
import { grepArgs } from './grep-args'
import type { FileExpr, LanguageLeaf } from './plan.types'

/** Options for {@linkcode listMatchingFiles}. */
export interface ListMatchingFilesOptions {
  /** The repository, usually a bare clone of a bundle. */
  gitDir: string
  /** The expression, already free of repository qualifiers. */
  expr: FileExpr
  /** The tree to search. Defaults to `HEAD`. */
  ref?: string
}

type FileSet = Result<Set<string>, GitError>

function escapeGlob(text: string): string {
  return text.replace(/[*?[\]\\]/g, '\\$&')
}

function languagePathspecs(leaf: LanguageLeaf): string[] {
  return [
    ...leaf.extensions.map(extension => `:(glob,icase)**/*${escapeGlob(extension)}`),
    ...leaf.filenames.map(filename => `:(glob,icase)**/${escapeGlob(filename)}`),
  ]
}

function matchesLanguage(leaf: LanguageLeaf, path: string): boolean {
  const lower = path.toLowerCase()
  const name = lower.slice(lower.lastIndexOf('/') + 1)
  return (
    leaf.extensions.some(extension => lower.endsWith(extension.toLowerCase())) ||
    leaf.filenames.some(filename => name === filename.toLowerCase())
  )
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

/**
 * Lists the files in a tree that an expression selects.
 *
 * Runs one `git ls-tree` for the tree's file list and one `git grep -l` per
 * `grep` leaf, then combines the sets in memory. Binary files never match a
 * `grep` leaf, as on GitHub.
 *
 * @returns The matching paths, sorted, or the first git failure.
 */
export async function listMatchingFiles(options: ListMatchingFilesOptions): Promise<Result<string[], GitError>> {
  const { gitDir, expr, ref = 'HEAD' } = options
  const pathspecs = narrowingPathspecs(expr)
  let universe: Promise<FileSet> | undefined

  const allFiles = (): Promise<FileSet> => {
    universe ??= runGit(['ls-tree', '-r', '-z', '--name-only', ref], { cwd: gitDir }).then(result =>
      result.map(({ stdout }) => new Set(splitNul(stdout))),
    )
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
        const regex = new RegExp(node.regex, 'i')
        return filterAll(path => regex.test(path))
      }
      case 'language':
        return filterAll(path => matchesLanguage(node, path))
      case 'grep': {
        const args = ['grep', '-l', '-z', '-I', ...grepArgs(node), ref, '--', ...pathspecs]
        const prefix = `${ref}:`
        const result = await runGit(args, { cwd: gitDir, allowExitCodes: [1] })
        return result.map(
          ({ stdout }) => new Set(splitNul(stdout).map(path => (path.startsWith(prefix) ? path.slice(prefix.length) : path))),
        )
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
