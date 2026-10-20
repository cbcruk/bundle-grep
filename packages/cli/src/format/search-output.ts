/**
 * Formats search events as text in the style of `grep`.
 *
 * @module
 */

import type { ChangedLine, MatchRange, SearchLine } from '@bundle-grep/core'

import { printable } from './ansi'
import type { CommitEvent, DoneEvent, FileEvent, Styles } from './format.types'

function highlight(text: string, ranges: readonly MatchRange[], styles: Styles): string {
  let out = ''
  let at = 0
  for (const { start, end } of ranges) {
    out += text.slice(at, start) + styles.red(styles.bold(text.slice(start, end)))
    at = end
  }
  return out + text.slice(at)
}

function formatLine(path: string, line: SearchLine, styles: Styles): string {
  const text = printable(line.text)
  if (line.context) return `${styles.magenta(path)}${styles.dim(`-${line.number}-`)}${styles.dim(text)}`
  const column = (line.column ?? 0) + 1
  return `${styles.magenta(path)}:${styles.green(String(line.number))}:${column}:${highlight(text, line.ranges, styles)}`
}

/**
 * Formats one matching file as `path:line:column:text` lines.
 *
 * Context lines read `path-line-text`. With `separate`, as when context is
 * shown, `--` goes between runs of lines that are not adjacent. A file that
 * matched on its path alone is just its path.
 * Columns are 1-based and count UTF-16 code units.
 */
export function formatFile(event: FileEvent, styles: Styles, separate: boolean): string {
  const path = printable(event.path)
  if (event.lines.length === 0) return `${styles.magenta(path)}\n`
  let out = ''
  let previous: number | undefined
  for (const line of event.lines) {
    if (separate && previous !== undefined && line.number > previous + 1) out += `${styles.dim('--')}\n`
    out += `${formatLine(path, line, styles)}\n`
    previous = line.number
  }
  return out
}

function formatChange(path: string, line: ChangedLine, styles: Styles): string {
  const sign = line.change === 'added' ? styles.green('+') : styles.red('-')
  return `${styles.magenta(path)}:${sign}${styles.green(String(line.number))}:${highlight(printable(line.text), line.ranges, styles)}`
}

/**
 * Formats one commit `history:` found: a `sha date subject` line, then each
 * matching change as `path:+line:text` or `path:-line:text`.
 *
 * The sha is abbreviated to 7 characters and the date is the author date's
 * day. An added line's number is in the commit's version of the file, a
 * removed line's in its parent's.
 */
export function formatCommit(event: CommitEvent, styles: Styles): string {
  const { sha, date, subject } = event.commit
  let out = `${styles.yellow(sha.slice(0, 7))} ${styles.dim(date.slice(0, 10))} ${printable(subject)}\n`
  for (const file of event.files) {
    const path = printable(file.path)
    for (const line of file.lines) out += `${formatChange(path, line, styles)}\n`
  }
  return out
}

/** Formats the repository heading printed before its first file. */
export function formatRepoHeading(repo: string, first: boolean, styles: Styles): string {
  return `${first ? '' : '\n'}${styles.bold(printable(repo))}\n`
}

/**
 * Summarises a finished search, such as `12 files in 3 repositories`, without a line break.
 *
 * A `history:` search counts commits instead, as `4 commits in 2 repositories`,
 * or `100+ commits` when a repository's history was not walked to the end.
 * Says when the results were cut at the limit, and when the search stopped
 * early.
 */
export function formatSummary(done: DoneEvent, shown: number): string {
  const repos = Object.keys(done.facets.repos).length
  const found =
    done.totalCommits === undefined
      ? plural(done.totalFiles, 'file')
      : `${done.totalCommits}${done.capped ? '+' : ''} ${done.totalCommits === 1 && !done.capped ? 'commit' : 'commits'}`
  const parts = [`${found} in ${plural(repos, 'repository', 'repositories')}`]
  if (done.truncated) parts.push(`showing ${shown}; raise --limit for more`)
  if (done.stopped === 'aborted') parts.push('stopped early')
  if (done.stopped === 'timeout') parts.push('timed out')
  return parts.join(', ')
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
