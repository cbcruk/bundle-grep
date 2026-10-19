/**
 * Runs a compiled query across repositories and streams the results.
 *
 * @module
 */

import { Result } from 'better-result'

import type { GitError } from '../git/git.errors'
import { hasCommit } from '../git/has-commit'
import { runGit } from '../git/run-git'
import { grepArgs } from '../plan/grep-args'
import { languageOf } from '../plan/languages'
import { listMatchingFiles } from '../plan/list-matching-files'
import type { GrepLeaf } from '../plan/plan.types'
import { specializePlan } from '../plan/specialize-plan'
import type { Pattern } from '../query/query.types'
import { byteColumnToIndex, createHighlighter } from './match-ranges'
import { parseGrepOutput } from './parse-grep-output'
import { PcreUnavailableError } from './search.errors'
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
export function toSearchRepoError(error: GitError): SearchRepoError {
  if (/USE_LIBPCRE|Perl-compatible/i.test(error.stderr)) {
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
 * repositories that already finished. A repository with no commits yet has
 * nothing to search, so it matches nothing rather than failing — unless
 * {@linkcode SearchRepo.ref} names a tree to search. The last event is `done`, carrying the
 * total and facets over every matching file even when `file` events stopped at
 * the limit. A `holds` callback that throws rejects the search instead.
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
  let reserved = 0
  let emitted = 0

  const searchRepo = async (repo: Repo): Promise<void> => {
    const expr = specializePlan(plan.expr, filter => holds(repo, filter))
    if (expr.op === 'none') return
    const ref = repo.ref ?? 'HEAD'

    const files = await listMatchingFiles({ gitDir: repo.gitDir, expr, ref, signal: stop })
    if (stop.aborted) return
    if (files.isErr()) {
      const empty = repo.ref === undefined && (await hasCommit(repo.gitDir, stop)).map(has => !has).unwrapOr(false)
      if (stop.aborted || empty) return
      push({ type: 'repo-error', repo: repo.name, error: toSearchRepoError(files.error) })
      return
    }

    const languages = new Map(files.value.map(path => [path, languageOf(path)]))
    const shown = files.value.slice(0, Math.max(0, limit - reserved))
    reserved += shown.length

    const lines =
      plan.highlight.length && shown.length
        ? await collectLines({ repo, ref, files: shown, patterns: plan.highlight, context, maxMatchesPerFile, signal: stop })
        : Result.ok(new Map<string, SearchLine[]>())
    if (stop.aborted) return
    if (lines.isErr()) {
      reserved -= shown.length
      push({ type: 'repo-error', repo: repo.name, error: toSearchRepoError(lines.error) })
      return
    }

    for (const [path, language] of languages) {
      totalFiles++
      count(facets.repos, repo.name)
      count(facets.paths, path.includes('/') ? path.slice(0, path.indexOf('/')) : '')
      if (language) count(facets.languages, language)
    }
    for (const path of shown) {
      emitted++
      push({ type: 'file', repo: repo.name, path, language: languages.get(path), lines: lines.value.get(path) ?? [] })
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
    yield { type: 'done', totalFiles, facets, truncated: totalFiles > emitted, ...(stopped ? { stopped } : {}) }
  } finally {
    finished.abort()
    await all.catch(() => undefined)
  }
}
