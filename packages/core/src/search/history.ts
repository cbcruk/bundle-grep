/**
 * Finds the commits whose changes match `history:`, with `git log -G`.
 *
 * @module
 */

import { Result } from 'better-result'

import type { GitError } from '../git/git.errors'
import { runGit } from '../git/run-git'
import { languageOf } from '../plan/languages'
import { narrowingPathspecs } from '../plan/list-matching-files'
import { matchesPath } from '../plan/match-path'
import type { HistoryPattern } from '../plan/plan.types'
import type { DescribeCommitsOptions, DescribedCommit, LoggedCommit, MatchingCommits, MatchingCommitsOptions } from './history.types'
import { createHighlighter } from './match-ranges'
import { createNameLogParser, parsePatchLog } from './parse-log'
import type { ChangedLine } from './search.types'

/**
 * Options every history `git log` shares: the pickaxe, case, every commit's
 * own diff including the root's, and nothing a user's config could add to
 * the output.
 */
function logArgs(history: HistoryPattern): string[] {
  return [
    'log',
    `-G${history.regex}`,
    ...(history.ignoreCase ? ['-i'] : []),
    '--root',
    '--no-renames',
    '--no-textconv',
    '--no-ext-diff',
    '--no-show-signature',
    '--no-color',
    '--encoding=UTF-8',
  ]
}

/**
 * Lists the commits reachable from `ref` whose changes match the pattern,
 * newest first, with the changed files `expr` keeps, stopping at `max`.
 *
 * `git log -G` keeps a commit when a line it added or removed matches, and
 * lists only the files with such lines; commits left with no file `expr`
 * keeps are dropped. Merges are left out, as `git log` shows them without a
 * diff. Git diffs every commit it walks past, so it is stopped as soon as
 * `max` commits were kept, or `enough` is aborted, rather than left to walk
 * the whole history. A commit counts once its output so far ends between
 * two names, rather than when the next commit begins, as git flushes after
 * each commit. Since a long list of names can still arrive in pieces, git is
 * only stopped once a commit counted early has been read to its end.
 *
 * @returns The commits and whether that was all of them, or the
 * {@linkcode GitError} of running git.
 */
export async function matchingCommits(options: MatchingCommitsOptions): Promise<Result<MatchingCommits, GitError>> {
  const { gitDir, ref, history, expr, max, signal, onCommit } = options
  const commits: LoggedCommit[] = []
  const full = new AbortController()
  const enough = options.enough ? AbortSignal.any([full.signal, options.enough]) : full.signal
  const kill = new AbortController()
  const kept = new Map<string, LoggedCommit>()
  let reading: string | undefined
  const stopWhenClosed = (): void => {
    if (enough.aborted && reading === undefined) kill.abort()
  }
  enough.addEventListener('abort', stopWhenClosed)
  const consider = (commit: LoggedCommit, closed: boolean): void => {
    const files = commit.files.filter(path => matchesPath(expr, path))
    const known = kept.get(commit.sha)
    if (known) {
      known.files = files
    } else if (files.length && commits.length < max && !enough.aborted) {
      const keep = { sha: commit.sha, files }
      kept.set(commit.sha, keep)
      commits.push(keep)
      if (!closed) reading = commit.sha
      onCommit?.(keep)
    }
    if (closed && reading === commit.sha) reading = undefined
    if (commits.length >= max) full.abort()
    stopWhenClosed()
  }
  const parser = createNameLogParser(commit => consider(commit, true))
  const decoder = new TextDecoder()
  const args = [...logArgs(history), '--format=%x1e%H', '--name-only', '-z', ref, '--', ...narrowingPathspecs(expr)]
  const result = await runGit(args, {
    cwd: gitDir,
    signal: AbortSignal.any([signal, kill.signal]),
    onStdout: chunk => {
      if (kill.signal.aborted) return
      parser.push(decoder.decode(chunk, { stream: true }))
      const open = parser.open()
      if (open) consider(open, false)
    },
  })
  enough.removeEventListener('abort', stopWhenClosed)
  const stopped = result.isOk() || result.error.exitCode === null
  if (kill.signal.aborted && !signal.aborted && stopped) return Result.ok({ commits, complete: false })
  if (result.isErr()) return result
  parser.push(decoder.decode())
  parser.end()
  return Result.ok({ commits, complete: commits.length < max })
}

/**
 * Reads the patches of some commits and keeps the changed lines that match.
 *
 * The commits are passed on stdin, so any number fit. Lines are matched
 * again in JavaScript to highlight them; a file where JavaScript reads the
 * pattern differently from git and finds nothing shows its changed lines
 * unhighlighted instead. At most `maxMatchesPerFile` lines are kept per file.
 *
 * @returns The commits in the order given, or the {@linkcode GitError} of
 * running git.
 */
export async function describeCommits(options: DescribeCommitsOptions): Promise<Result<DescribedCommit[], GitError>> {
  const { gitDir, commits, history, maxMatchesPerFile, signal } = options
  if (commits.length === 0) return Result.ok([])
  const args = [
    ...logArgs(history),
    '--no-walk=unsorted',
    '--stdin',
    '--format=%x1e%H%x00%P%x00%aI%x00%an%x00%s%x00',
    '--patch',
    '--unified=0',
    '--inter-hunk-context=0',
    '--src-prefix=a/',
    '--dst-prefix=b/',
  ]
  const result = await runGit(args, { cwd: gitDir, input: commits.map(commit => `${commit.sha}\n`).join(''), signal })
  if (result.isErr()) return result

  const kept = new Map(commits.map(commit => [commit.sha, new Set(commit.files)]))
  const highlight = createHighlighter([history.pattern])
  return Result.ok(
    parsePatchLog(result.value.stdout.toString('utf8')).map(({ fields: [sha, parents, date, author, subject], files }) => ({
      commit: { sha, parent: parents.split(' ')[0] || null, date, author, subject },
      files: files
        .filter(file => kept.get(sha)?.has(file.path))
        .map(file => {
          const highlighted = file.lines.map((line): ChangedLine => ({ ...line, ranges: highlight(line.text) }))
          const matched = highlighted.filter(line => line.ranges.length > 0)
          const lines = (matched.length ? matched : highlighted).slice(0, maxMatchesPerFile)
          const language = languageOf(file.path)
          return { path: file.path, ...(language ? { language } : {}), lines }
        }),
    })),
  )
}
