/**
 * Finds where highlight patterns match within a result line.
 *
 * @module
 */

import { Result } from 'better-result'

import { escapeRegex } from '../plan/path-regex'
import type { Pattern } from '../query/query.types'
import type { MatchRange } from './search.types'

function toRegex(pattern: Pattern): RegExp | undefined {
  if (pattern.kind === 'literal') return new RegExp(escapeRegex(pattern.value), 'gi')
  const caseSensitive = pattern.source.startsWith('(?-i)')
  const source = caseSensitive ? pattern.source.slice('(?-i)'.length) : pattern.source
  return Result.try(() => new RegExp(source, caseSensitive ? 'g' : 'gi')).unwrapOr(undefined)
}

/**
 * Builds a function that lists every range of a line any pattern matches.
 *
 * Ranges come back sorted, with overlapping and touching ones merged. A regex
 * JavaScript cannot compile — PCRE-only syntax such as possessive quantifiers —
 * contributes no ranges; git's reported column is the fallback for those.
 *
 * @example Highlighting a line
 * ```ts
 * import { createHighlighter } from "./match-ranges";
 *
 * const highlight = createHighlighter([{ kind: "literal", value: "foo", quoted: false }]);
 *
 * highlight("Foo and foo"); // [{ start: 0, end: 3 }, { start: 8, end: 11 }]
 * ```
 */
export function createHighlighter(patterns: readonly Pattern[]): (text: string) => MatchRange[] {
  const regexes = patterns.map(toRegex).filter((regex): regex is RegExp => regex !== undefined)

  return text => {
    const ranges: MatchRange[] = []
    for (const regex of regexes) {
      regex.lastIndex = 0
      for (let match = regex.exec(text); match; match = regex.exec(text)) {
        if (match[0] === '') {
          regex.lastIndex++
          continue
        }
        ranges.push({ start: match.index, end: match.index + match[0].length })
      }
    }

    ranges.sort((a, b) => a.start - b.start)
    const merged: MatchRange[] = []
    for (const range of ranges) {
      const last = merged.at(-1)
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
      else merged.push({ ...range })
    }
    return merged
  }
}

/** Converts git's 1-based byte column within a line to a UTF-16 index into its text. */
export function byteColumnToIndex(text: string, byteColumn: number): number {
  return Buffer.from(text, 'utf8')
    .subarray(0, byteColumn - 1)
    .toString('utf8').length
}
