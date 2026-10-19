/**
 * Formats search events as text in the style of `grep`.
 *
 * @module
 */

import type { MatchRange, SearchLine } from '@bundle-grep/core'

import { printable } from './ansi'
import type { DoneEvent, FileEvent, Styles } from './format.types'

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

/** Formats the repository heading printed before its first file. */
export function formatRepoHeading(repo: string, first: boolean, styles: Styles): string {
  return `${first ? '' : '\n'}${styles.bold(printable(repo))}\n`
}

/**
 * Summarises a finished search, such as `12 files in 3 repositories`, without a line break.
 *
 * Says when the results were cut at the limit, and when the search stopped
 * early.
 */
export function formatSummary(done: DoneEvent, shown: number): string {
  const repos = Object.keys(done.facets.repos).length
  const parts = [`${plural(done.totalFiles, 'file')} in ${plural(repos, 'repository', 'repositories')}`]
  if (done.truncated) parts.push(`showing ${shown}; raise --limit for more`)
  if (done.stopped === 'aborted') parts.push('stopped early')
  if (done.stopped === 'timeout') parts.push('timed out')
  return parts.join(', ')
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
