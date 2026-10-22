/**
 * Splits result lines into the pieces the results list renders.
 *
 * @module
 */

import type { MatchRange, SearchLine } from '@bundle-grep/core'

import type { Segment } from './highlight.types'
import type { SyntaxToken } from './syntax.types'

function colorSegments(text: string, matches: readonly Segment[], tokens: readonly SyntaxToken[]): Segment[] {
  const out: Segment[] = []
  let start = 0
  let m = 0
  let t = 0
  let matchEnd = matches[0]!.text.length
  let tokenEnd = tokens[0]?.text.length ?? text.length
  while (start < text.length) {
    const end = Math.min(matchEnd, tokenEnd)
    if (end > start) out.push({ text: text.slice(start, end), match: matches[m]!.match, style: tokens[t]?.style })
    start = end
    if (end === matchEnd && ++m < matches.length) matchEnd += matches[m]!.text.length
    if (end === tokenEnd && ++t < tokens.length) tokenEnd += tokens[t]!.text.length
  }
  return out
}

/**
 * Splits a line into plain and highlighted runs, colored by syntax when given tokens.
 *
 * Ranges may overlap or run past the end of the line, as different patterns
 * can match the same text; they are merged and clamped. Tokens that do not
 * cover the line exactly are ignored.
 *
 * @param tokens The line's runs from `syntaxTokens` in `syntax.ts`.
 */
export function segments(text: string, ranges: readonly MatchRange[], tokens?: readonly SyntaxToken[]): Segment[] {
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
  if (!tokens || text === '' || tokens.reduce((length, token) => length + token.text.length, 0) !== text.length) return out
  return colorSegments(text, out, tokens)
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
