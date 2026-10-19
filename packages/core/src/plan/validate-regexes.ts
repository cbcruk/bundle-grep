/**
 * Checks a query's content regexes with the engine that will run them.
 *
 * @module
 */

import { Result } from 'better-result'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'

import type { GitError } from '../git/git.errors'
import { runGit } from '../git/run-git'
import type { QueryNode, Span } from '../query/query.types'
import { PcreUnavailableError } from '../search/search.errors'
import { toSearchRepoError } from '../search/search'
import { grepArgs } from './grep-args'
import { QueryCompileError } from './plan.errors'
import type { GrepLeaf, ValidateRegexesOptions } from './plan.types'

interface Regex {
  source: string
  span: Span
}

/** Collects the regexes git will run as PCRE, first occurrence of each, in query order. */
function contentRegexes(node: QueryNode, into: Map<string, Regex>): Map<string, Regex> {
  switch (node.type) {
    case 'match': {
      const { field, pattern, span } = node
      if (pattern.kind === 'regex' && field !== 'path' && !into.has(pattern.source)) {
        into.set(pattern.source, { source: pattern.source, span })
      }
      break
    }
    case 'filter':
      break
    case 'not':
      contentRegexes(node.child, into)
      break
    case 'and':
    case 'or':
      for (const child of node.children) contentRegexes(child, into)
  }
  return into
}

/** Turns git's `fatal: -e option, '<source>': <reason>` into the reason alone. */
function reasonOf(stderr: string, source: string): string {
  const message = stderr.trim().replace(/^fatal: /, '')
  const prefix = `-e option, '${source}': `
  return message.startsWith(prefix) ? message.slice(prefix.length) : message
}

/**
 * Compiles one source with `git grep -P` and the flags a search uses.
 *
 * git compiles its patterns before reading any file, and `--no-index` with a
 * pathspec naming nothing that exists leaves it no files to read, so this
 * needs no repository and does no work beyond the compile.
 */
async function checkRegex(
  { source, span }: Regex,
  signal: AbortSignal | undefined,
): Promise<Result<void, QueryCompileError | PcreUnavailableError | GitError>> {
  const leaf: GrepLeaf = { op: 'grep', engine: 'pcre', patterns: [source], match: 'any' }
  const args = ['grep', '--no-index', '-q', ...grepArgs(leaf), '--', `:(literal)${randomUUID()}/`]
  const result = await runGit(args, { cwd: tmpdir(), allowExitCodes: [1], signal })
  if (result.isOk()) return Result.ok()

  const error = toSearchRepoError(result.error)
  if (error instanceof PcreUnavailableError || result.error.exitCode !== 128 || signal?.aborted) return Result.err(error)
  return Result.err(
    new QueryCompileError({
      message: `Invalid regular expression: ${reasonOf(result.error.stderr, source)}`,
      span,
    }),
  )
}

/**
 * Checks that git can compile every content regex of a query.
 *
 * {@linkcode compileQuery} validates `path:` regexes, which JavaScript runs,
 * but leaves content regexes to git's PCRE. Without this check an invalid one
 * fails each repository's search separately, with git's message and no span.
 * Each distinct regex costs one short `git grep`; a query without any runs
 * nothing.
 *
 * @returns Nothing when every regex compiles; a {@linkcode QueryCompileError}
 * spanning the first one that does not, in query order; a
 * {@linkcode PcreUnavailableError} when this git has no PCRE; or a
 * {@linkcode GitError} when git cannot run or is stopped.
 *
 * @example Checking a query before searching
 * ```ts
 * import { parseQuery, validateRegexes } from "@bundle-grep/core";
 *
 * const query = parseQuery("content:/[a-z/").unwrap();
 * const checked = await validateRegexes(query);
 *
 * if (checked.isErr()) console.error(checked.error.message);
 * ```
 */
export async function validateRegexes(
  query: QueryNode,
  options: ValidateRegexesOptions = {},
): Promise<Result<void, QueryCompileError | PcreUnavailableError | GitError>> {
  const regexes = [...contentRegexes(query, new Map()).values()]
  for (const result of await Promise.all(regexes.map(regex => checkRegex(regex, options.signal)))) {
    if (result.isErr()) return result
  }
  return Result.ok()
}
