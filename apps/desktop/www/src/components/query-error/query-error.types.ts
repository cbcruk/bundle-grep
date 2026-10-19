/**
 * Props for showing a rejected query.
 *
 * @module
 */

import type { WireError } from '../../api/api.types'

/** Props for {@linkcode QueryError}. */
export interface QueryErrorProps {
  /** The query the error is about. */
  query: string
  /** The error, with the span of the query it points at, if any. */
  error: WireError
}
