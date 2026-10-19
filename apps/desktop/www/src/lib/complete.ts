/**
 * Suggests qualifiers and their values as a query is typed.
 *
 * @module
 */

import type { CompletionSources, Suggestion, Word } from './complete.types'
import { quoteValue } from './query-edit'

const KEYS = ['repo:', 'language:', 'path:', 'org:', 'user:', 'content:', 'is:']

const IS_VALUES = ['fork', 'archived']

const MAX_SUGGESTIONS = 8

/**
 * Finds the word the caret is in, bounded by whitespace and parentheses.
 *
 * @returns The word, or `undefined` when the caret is not in or just after one.
 */
export function wordAt(query: string, caret: number): Word | undefined {
  let start = caret
  while (start > 0 && !/[\s()]/.test(query[start - 1]!)) start--
  let end = caret
  while (end < query.length && !/[\s()]/.test(query[end]!)) end++
  if (start === caret) return undefined
  return { start, end, typed: query.slice(start, caret) }
}

function rankValues(values: readonly string[], partial: string): string[] {
  const lower = partial.toLowerCase()
  const prefixed = values.filter(value => value.toLowerCase().startsWith(lower))
  const inside = values.filter(value => !value.toLowerCase().startsWith(lower) && value.toLowerCase().includes(lower))
  return [...prefixed, ...inside].filter(value => value.toLowerCase() !== lower).slice(0, MAX_SUGGESTIONS)
}

function valuesFor(key: string, sources: CompletionSources): readonly string[] {
  if (key === 'repo') return sources.repos
  if (key === 'language') return sources.languages
  if (key === 'org' || key === 'user') return [...new Set(sources.repos.map(repo => repo.split('/')[0]!))]
  if (key === 'is') return IS_VALUES
  return []
}

/**
 * Lists completions for a word: qualifier names for a bare word, and values
 * for `repo:`, `language:`, `org:`, `user:`, and `is:`. A leading `-` is kept.
 *
 * @example Completing a language
 * ```ts
 * import { suggest } from "./complete";
 *
 * suggest({ start: 0, end: 11, typed: "language:ty" }, { repos: [], languages: ["TypeScript"] });
 * // [{ label: "TypeScript", insert: "language:TypeScript", complete: true }]
 * ```
 */
export function suggest(word: Word, sources: CompletionSources): Suggestion[] {
  const negated = word.typed.startsWith('-')
  const typed = negated ? word.typed.slice(1) : word.typed
  const sign = negated ? '-' : ''
  const colon = typed.indexOf(':')
  if (colon === -1) {
    const lower = typed.toLowerCase()
    if (lower === '') return []
    return KEYS.filter(key => key.startsWith(lower) && key !== lower).map(key => ({
      label: key,
      insert: sign + key,
      complete: false,
    }))
  }
  const key = typed.slice(0, colon).toLowerCase()
  const partial = typed.slice(colon + 1).replace(/^"/, '')
  return rankValues(valuesFor(key, sources), partial).map(value => ({
    label: value,
    insert: `${sign}${key}:${quoteValue(value)}`,
    complete: true,
  }))
}

/**
 * Replaces the word with a suggestion.
 *
 * @returns The new query and where the caret goes: after the inserted text,
 * and past the space that follows a complete qualifier.
 */
export function applySuggestion(query: string, word: Word, suggestion: Suggestion): { query: string; caret: number } {
  const before = query.slice(0, word.start)
  const after = query.slice(word.end)
  const space = suggestion.complete && !after.startsWith(' ') ? ' ' : ''
  const caret = before.length + suggestion.insert.length + (suggestion.complete ? 1 : 0)
  return { query: before + suggestion.insert + space + after, caret }
}
