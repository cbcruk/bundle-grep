/**
 * Runs a compiled query across repositories and streams the results.
 *
 * @module
 */

import { Result } from 'better-result'

import { GitError } from '../git/git.errors'
import { isEmptyRepo } from '../git/is-empty-repo'
import { resolveCommit } from '../git/resolve-commit'
import { runGit } from '../git/run-git'
import { grepArgs } from '../plan/grep-args'
import { languageOf } from '../plan/languages'
import { listMatchingFiles } from '../plan/list-matching-files'
import type { FileExpr, GrepLeaf, HistoryPattern } from '../plan/plan.types'
import { specializePlan } from '../plan/specialize-plan'
import type { Pattern } from '../query/query.types'
import { symbolIndex } from '../symbols/symbol-index'
import type { SymbolIndex, SymbolIndexError } from '../symbols/symbols.types'
import { describeCommits, matchingCommits } from './history'
import { byteColumnToIndex, createHighlighter } from './match-ranges'
import { parseGrepOutput } from './parse-grep-output'
import { PcreUnavailableError } from './search.errors'
import { collectSymbolLines, mergeLines } from './symbol-lines'
import type {
  LineOptions,
  SearchEvent,
  SearchFacets,
  SearchLine,
  SearchOptions,
  SearchRepo,
  SearchRepoError,
} from './search.types'

/**
 * Most bytes of `:(literal)` pathspecs to put on one command line; beyond it,
 * line extraction greps the whole tree and filters instead. Kept well under
 * Windows' 32 KiB limit, the smallest of the platforms git runs on.
 */
const MAX_PATHSPEC_BYTES = 24 * 1024

/**
 * Tells a git built without PCRE apart from other git failures.
 *
 * @returns A {@linkcode PcreUnavailableError} when git's message says PCRE is
 * missing, the original error otherwise.
 */
export function toSearchRepoError<E extends SearchRepoError>(error: E): E | PcreUnavailableError {
  if (error instanceof GitError && /USE_LIBPCRE|Perl-compatible/i.test(error.stderr)) {
    return new PcreUnavailableError({
      message: 'This git was built without PCRE support, which regular expression searches need',
    })
  }
  return error
}

function engineGroups(patterns: readonly Pattern[]): GrepLeaf[] {
  const fixed = patterns.flatMap(pattern => (pattern.kind === 'literal' ? [pattern.value] : []))
  const pcre = patterns.flatMap(pattern => (pattern.kind === 'regex' ? [pattern.source] : []))
  return [
    ...(fixed.length ? [{ op: 'grep', engine: 'fixed', patterns: fixed, match: 'any' } as const] : []),
    ...(pcre.length ? [{ op: 'grep', engine: 'pcre', patterns: pcre, match: 'any' } as const] : []),
  ]
}

function literalPathspecs(files: readonly string[]): string[] {
  const pathspecs = files.map(path => `:(literal)${path}`)
  const bytes = pathspecs.reduce((total, pathspec) => total + Buffer.byteLength(pathspec) + 1, 0)
  return bytes <= MAX_PATHSPEC_BYTES ? pathspecs : []
}

/**
 * Collects matching and context lines for a set of files.
 *
 * Runs one `git grep` per pattern engine and merges them: a line that matched
 * in either run wins over the same line shown as context, and keeps the
 * earlier of the two runs' first-match columns.
 */
export async function collectLines(options: LineOptions): Promise<Result<Map<string, SearchLine[]>, GitError>> {
  const { repo, ref, files, patterns, context, maxMatchesPerFile, signal } = options
  const wanted = new Set(files)
  const pathspecs = literalPathspecs(files)
  const highlight = createHighlighter(patterns)
  const byFile = new Map<string, Map<number, SearchLine>>()

  for (const leaf of engineGroups(patterns)) {
    const args = [
      'grep',
      '--no-color',
      '-n',
      '--column',
      '-z',
      '-I',
      `--max-count=${maxMatchesPerFile}`,
      ...(context > 0 ? [`-C${context}`] : []),
      ...grepArgs(leaf),
      ref,
      '--',
      ...pathspecs,
    ]
    const result = await runGit(args, { cwd: repo.gitDir, allowExitCodes: [1], signal })
    if (result.isErr()) return result

    for (const line of parseGrepOutput(result.value.stdout, ref)) {
      if (!wanted.has(line.path)) continue
      const lines = byFile.get(line.path) ?? new Map<number, SearchLine>()
      byFile.set(line.path, lines)
      const existing = lines.get(line.number)
      if (line.byteColumn === undefined) {
        if (!existing) lines.set(line.number, { number: line.number, text: line.text, context: true, ranges: [] })
        continue
      }
      const column = byteColumnToIndex(line.text, line.byteColumn)
      lines.set(line.number, {
        number: line.number,
        text: line.text,
        context: false,
        column: existing?.column === undefined ? column : Math.min(existing.column, column),
        ranges: existing && !existing.context ? existing.ranges : highlight(line.text),
      })
    }
  }

  return Result.ok(
    new Map([...byFile].map(([path, lines]) => [path, [...lines.values()].sort((a, b) => a.number - b.number)])),
  )
}

function hasSymbolLeaf(expr: FileExpr): boolean {
  if (expr.op === 'symbol') return true
  if (expr.op === 'not') return hasSymbolLeaf(expr.child)
  if (expr.op === 'and' || expr.op === 'or') return expr.children.some(hasSymbolLeaf)
  return false
}

function count(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1
}

/**
 * Searches repositories for a compiled query, streaming results as they come.
 *
 * Repositories are searched {@linkcode SearchOptions.concurrency} at a time,
 * and one ruled out by its qualifiers is skipped without running git. Each
 * repository's matching files arrive in path order; repositories arrive as
 * they finish. A repository that fails yields a `repo-error`, counts towards
 * nothing, and the rest carry on; its share of the limit is not handed to
 * repositories that already finished. A freshly initialised repository, with
 * no refs at all, matches nothing instead of failing, unless
 * {@linkcode SearchRepo.ref} names a tree to search. The last event is
 * `done`, carrying the total and facets over every matching file even when
 * `file` events stopped at the limit. A `holds` callback that throws rejects
 * the search instead.
 *
 * A plan with a `ref:` searches the commit it names in each repository,
 * skipping repositories without it, and its `file` events carry that commit.
 * A plan with `history:` yields `commit` events instead of `file` events:
 * the commits reachable from `HEAD`, or from the `ref:`, whose added or
 * removed lines match, newest first, each with the matching lines of the
 * files that `path:` and `language:` keep.
 *
 * Stopping early — breaking out of the loop, aborting
 * {@linkcode SearchOptions.signal}, or reaching
 * {@linkcode SearchOptions.timeoutMs} — kills any git still running.
 *
 * @template Repo The repositories' type, passed to `holds` as given.
 *
 * @example Printing matching lines
 * ```ts
 * import { compileQuery, parseQuery, search } from "@bundle-grep/core";
 *
 * const plan = parseQuery("useState language:typescript").andThen(compileQuery).unwrap();
 * const repos = [{ name: "cbcruk/barlo", gitDir: "./cache/cbcruk/barlo.git" }];
 *
 * for await (const event of search({ plan, repos, holds: () => true })) {
 *   if (event.type === "file") {
 *     for (const line of event.lines) console.log(`${event.repo}/${event.path}:${line.number}: ${line.text}`);
 *   }
 * }
 * ```
 */
export async function* search<Repo extends SearchRepo>(
  options: SearchOptions<Repo>,
): AsyncGenerator<SearchEvent, void, undefined> {
  const { plan, repos, holds, context = 0, maxMatchesPerFile = 20 } = options
  const limit = Math.max(0, options.limit ?? 100)
  const concurrency = Math.max(1, options.concurrency ?? 4)

  const finished = new AbortController()
  const timeout = options.timeoutMs === undefined ? undefined : AbortSignal.timeout(options.timeoutMs)
  const stop = AbortSignal.any(
    [finished.signal, options.signal, timeout].filter((signal): signal is AbortSignal => signal !== undefined),
  )

  const queue: SearchEvent[] = []
  let wake: (() => void) | undefined
  const push = (event: SearchEvent): void => {
    queue.push(event)
    wake?.()
  }

  const facets: SearchFacets = { languages: {}, repos: {}, paths: {} }
  let totalFiles = 0
  let totalCommits = 0
  let reserved = 0
  let emitted = 0

  const failed = async (repo: Repo, error: SymbolIndexError): Promise<void> => {
    const empty = repo.ref === undefined && (await isEmptyRepo(repo.gitDir, stop)).unwrapOr(false)
    if (stop.aborted || empty) return
    push({ type: 'repo-error', repo: repo.name, error: toSearchRepoError(error) })
  }

  const lost = (repo: Repo, shown: number, error: GitError): void => {
    reserved -= shown
    push({ type: 'repo-error', repo: repo.name, error: toSearchRepoError(error) })
  }

  const searchHistory = async (repo: Repo, expr: FileExpr, ref: string, history: HistoryPattern): Promise<void> => {
    const commits = await matchingCommits({ gitDir: repo.gitDir, ref, history, expr, signal: stop })
    if (stop.aborted) return
    if (commits.isErr()) return failed(repo, commits.error)

    const shown = commits.value.slice(0, Math.max(0, limit - reserved))
    reserved += shown.length
    const described = await describeCommits({ gitDir: repo.gitDir, commits: shown, history, maxMatchesPerFile, signal: stop })
    if (stop.aborted) return
    if (described.isErr()) return lost(repo, shown.length, described.error)

    for (const commit of commits.value) {
      totalCommits++
      count(facets.repos, repo.name)
      for (const path of commit.files) {
        totalFiles++
        count(facets.paths, path.includes('/') ? path.slice(0, path.indexOf('/')) : '')
        const language = languageOf(path)
        if (language) count(facets.languages, language)
      }
    }
    for (const { commit, files } of described.value) {
      emitted++
      push({ type: 'commit', repo: repo.name, commit, files })
    }
  }

  const searchRepo = async (repo: Repo): Promise<void> => {
    const expr = specializePlan(plan.expr, filter => holds(repo, filter))
    if (expr.op === 'none') return
    let ref = repo.ref ?? 'HEAD'
    if (plan.ref !== undefined) {
      const resolved = await resolveCommit(repo.gitDir, plan.ref, stop)
      if (stop.aborted) return
      if (resolved.isErr()) return failed(repo, resolved.error)
      if (resolved.value === undefined) return
      ref = resolved.value
    }
    if (plan.history) return searchHistory(repo, expr, ref, plan.history)

    let symbols: SymbolIndex | undefined
    if (hasSymbolLeaf(expr)) {
      const index = await symbolIndex(repo.gitDir, { ref, signal: stop })
      if (stop.aborted) return
      if (index.isErr()) return failed(repo, index.error)
      symbols = index.value
    }

    const files = await listMatchingFiles({ gitDir: repo.gitDir, expr, ref, symbols, signal: stop })
    if (stop.aborted) return
    if (files.isErr()) return failed(repo, files.error)

    const languages = new Map(files.value.map(path => [path, languageOf(path)]))
    const shown = files.value.slice(0, Math.max(0, limit - reserved))
    reserved += shown.length

    const [lines, symbolLines] = await Promise.all([
      plan.highlight.length && shown.length
        ? collectLines({ repo, ref, files: shown, patterns: plan.highlight, context, maxMatchesPerFile, signal: stop })
        : Result.ok(new Map<string, SearchLine[]>()),
      symbols && plan.symbols.length && shown.length
        ? collectSymbolLines({ repo, index: symbols, files: shown, leaves: plan.symbols, context, maxMatchesPerFile, signal: stop })
        : Result.ok(new Map<string, SearchLine[]>()),
    ])
    if (stop.aborted) return
    if (lines.isErr()) return lost(repo, shown.length, lines.error)
    if (symbolLines.isErr()) return lost(repo, shown.length, symbolLines.error)

    for (const [path, language] of languages) {
      totalFiles++
      count(facets.repos, repo.name)
      count(facets.paths, path.includes('/') ? path.slice(0, path.indexOf('/')) : '')
      if (language) count(facets.languages, language)
    }
    for (const path of shown) {
      emitted++
      const found = mergeLines(lines.value.get(path) ?? [], symbolLines.value.get(path) ?? [])
      const commit = plan.ref === undefined ? {} : { commit: ref }
      push({ type: 'file', repo: repo.name, path, language: languages.get(path), lines: found, ...commit })
    }
  }

  let next = 0
  let running = true
  const workers = Array.from({ length: Math.min(concurrency, repos.length) }, async () => {
    while (next < repos.length && !stop.aborted) await searchRepo(repos[next++]!)
  })
  const all = Promise.all(workers).finally(() => {
    running = false
    wake?.()
  })

  try {
    for (;;) {
      const event = queue.shift()
      if (event) {
        yield event
        continue
      }
      if (!running) break
      await new Promise<void>(resolve => (wake = resolve))
      wake = undefined
    }
    await all

    const stopped = options.signal?.aborted ? 'aborted' : timeout?.aborted ? 'timeout' : undefined
    const truncated = (plan.history ? totalCommits : totalFiles) > emitted
    yield {
      type: 'done',
      totalFiles,
      ...(plan.history ? { totalCommits } : {}),
      facets,
      truncated,
      ...(stopped ? { stopped } : {}),
    }
  } finally {
    finished.abort()
    await all.catch(() => undefined)
  }
}
