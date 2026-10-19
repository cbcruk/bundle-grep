/**
 * Splits result lines into the pieces the results list renders.
 *
 * @module
 */

import type { MatchRange, SearchLine } from '@bundle-grep/core'

import type { Segment } from './highlight.types'

/**
 * Splits a line into plain and highlighted runs.
 *
 * Ranges may overlap or run past the end of the line, as different patterns
 * can match the same text; they are merged and clamped.
 */
export function segments(text: string, ranges: readonly MatchRange[]): Segment[] {
  const merged: MatchRange[] = []
  for (const range of ranges.toSorted((a, b) => a.start - b.start)) {
    const start = Math.max(0, Math.min(range.start, text.length))
    const end = Math.max(start, Math.min(range.end, text.length))
    if (end === start) continue
    const last = merged.at(-1)
    if (last && start <= last.end) last.end = Math.max(last.end, end)
    else merged.push({ start, end })
  }
  const out: Segment[] = []
  let at = 0
  for (const range of merged) {
    if (range.start > at) out.push({ text: text.slice(at, range.start), match: false })
    out.push({ text: text.slice(range.start, range.end), match: true })
    at = range.end
  }
  if (at < text.length || out.length === 0) out.push({ text: text.slice(at), match: false })
  return out
}

/** Groups lines into runs of consecutive line numbers, which the list separates with a gap. */
export function hunks(lines: readonly SearchLine[]): SearchLine[][] {
  const out: SearchLine[][] = []
  for (const line of lines) {
    const current = out.at(-1)
    if (current && current.at(-1)!.number + 1 === line.number) current.push(line)
    else out.push([line])
  }
  return out
}
