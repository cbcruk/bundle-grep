/**
 * Checks a query's content regexes with the engine that will run them.
 *
 * @module
 */

import { Result } from 'better-result'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'

import type { GitError } from '../git/git.errors'
import { runGit } from '../git/run-git'
import type { QueryNode, Span } from '../query/query.types'
import type { PcreUnavailableError } from '../search/search.errors'
import { toSearchRepoError } from '../search/search'
import { grepArgs } from './grep-args'
import { QueryCompileError } from './plan.errors'
import type { GrepLeaf, ValidateRegexesOptions } from './plan.types'

interface Regex {
  source: string
  span: Span
  engine: 'pcre' | 'history'
}

/** Collects the regexes git will run, as PCRE or as `history:`'s extended regexes, first occurrence of each, in query order. */
function gitRegexes(node: QueryNode, into: Map<string, Regex>): Map<string, Regex> {
  switch (node.type) {
    case 'match': {
      const { field, pattern, span } = node
      if (pattern.kind !== 'regex' || field === 'path' || field === 'symbol') break
      const engine = field === 'history' ? 'history' : 'pcre'
      const source = engine === 'history' ? pattern.source.replace(/^\(\?-i\)/, '') : pattern.source
      if (!into.has(`${engine}:${source}`)) into.set(`${engine}:${source}`, { source, span, engine })
      break
    }
    case 'filter':
      break
    case 'not':
      gitRegexes(node.child, into)
      break
    case 'and':
    case 'or':
      for (const child of node.children) gitRegexes(child, into)
  }
  return into
}

/**
 * Finds the reason in git's `fatal: -e option, '<source>': <reason>` line, or
 * its `fatal: invalid regex: <reason>` line for `history:`.
 *
 * @returns The reason, or `undefined` when git failed for something other
 * than the pattern, such as a broken config file.
 */
function reasonOf(stderr: string, { source, engine }: Regex): string | undefined {
  const prefix = engine === 'history' ? 'fatal: invalid regex: ' : `fatal: -e option, '${source}': `
  return stderr
    .split(/\r?\n/)
    .find(line => line.startsWith(prefix))
    ?.slice(prefix.length)
}

/** A directory to run git in that exists even when `TMPDIR` names one that does not. */
function scratchDir(): string {
  const dir = tmpdir()
  return existsSync(dir) ? dir : process.cwd()
}

/**
 * Compiles one source the way a search will run it.
 *
 * A content regex goes through `git grep -P` with the flags a search uses:
 * git compiles its patterns before reading any file, and `--no-index` with a
 * pathspec naming nothing that exists leaves it no files to read. A
 * `history:` regex goes through `git diff --no-index -G` between two empty
 * files, which compiles it as `git log -G` does and compares nothing. Neither
 * needs a repository of its own, though git still reads its config files,
 * including those of a repository around the directory it runs in.
 */
async function checkRegex(
  regex: Regex,
  signal: AbortSignal | undefined,
): Promise<Result<void, QueryCompileError | PcreUnavailableError | GitError>> {
  const { source, span, engine } = regex
  const leaf: GrepLeaf = { op: 'grep', engine: 'pcre', patterns: [source], match: 'any' }
  const args =
    engine === 'history'
      ? ['diff', '--no-index', '--quiet', `-G${source}`, '--', '/dev/null', '/dev/null']
      : ['grep', '--no-index', '-q', ...grepArgs(leaf), '--', `:(literal)${randomUUID()}/`]
  const result = await runGit(args, { cwd: scratchDir(), allowExitCodes: [1], signal })
  if (result.isOk()) return Result.ok()

  const reason = signal?.aborted ? undefined : reasonOf(result.error.stderr, regex)
  if (reason === undefined) return Result.err(toSearchRepoError(result.error))
  return Result.err(new QueryCompileError({ message: `Invalid regular expression: ${reason}`, span }))
}

/**
 * Checks that git can compile every content and `history:` regex of a query.
 *
 * {@linkcode compileQuery} validates `path:` and `symbol:` regexes, which
 * JavaScript runs, but leaves content regexes to git's PCRE and `history:`
 * regexes to the POSIX extended regexes of `git log -G`. Without this check
 * an invalid one fails each repository's search separately, with git's
 * message and no span. Each distinct regex costs one short git run; a query
 * without any runs nothing.
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
  const regexes = [...gitRegexes(query, new Map()).values()]
  for (const result of await Promise.all(regexes.map(regex => checkRegex(regex, options.signal)))) {
    if (result.isErr()) return result
  }
  return Result.ok()
}
