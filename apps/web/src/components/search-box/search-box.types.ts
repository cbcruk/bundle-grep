/**
 * Props for the search box.
 *
 * @module
 */

import type { RefObject } from 'react'

import type { CompletionSources } from '../../lib/complete.types'

/** Props for {@linkcode SearchBox}. */
export interface SearchBoxProps {
  /** The query last searched, which the box shows whenever it changes. */
  query: string
  /** Where completions come from. */
  sources: CompletionSources
  /** Called with a query that parses. */
  onSearch: (query: string) => void
  /** The input, so `/` can focus it from anywhere. */
  inputRef: RefObject<HTMLInputElement | null>
}
