/**
 * Types for completing qualifiers in the search box.
 *
 * @module
 */

/** The run of non-space characters the caret is in, which a suggestion replaces. */
export interface Word {
  /** Index of the word's first character. */
  start: number
  /** Index just past its last character. */
  end: number
  /** The word up to the caret, which is what suggestions are matched against. */
  typed: string
}

/** One entry in the completion list. */
export interface Suggestion {
  /** What the list shows. */
  label: string
  /** What replaces the word. */
  insert: string
  /** `true` when the qualifier is complete, so a space follows it. */
  complete: boolean
}

/** The values completions are drawn from. */
export interface CompletionSources {
  /** Archived repositories, as `owner/name`. */
  repos: readonly string[]
  /** Language names, in the order to suggest them. */
  languages: readonly string[]
}
