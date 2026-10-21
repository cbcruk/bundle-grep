/**
 * Props for the results column.
 *
 * @module
 */

import type { SearchState } from '../../hooks/use-search.types'

/** Props for {@linkcode Results}. */
export interface ResultsProps {
  /** The query searched. */
  query: string
  /** `true` when the search asked for {@linkcode ResultsProps.maxLimit} files. */
  more?: true
  /** The search so far. */
  search: SearchState
  /** The most files the search was asked for. */
  limit: number
  /** The most files the server will send. */
  maxLimit: number
  /** Searches again with {@linkcode ResultsProps.maxLimit}. */
  onShowMore: () => void
  /** The languages `symbol:` covers, named when a `symbol:` query finds nothing. */
  symbolLanguages: readonly string[]
}
