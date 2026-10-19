/**
 * The ways a query can fail to parse.
 *
 * @module
 */

import { TaggedError } from 'better-result'

import type { Span } from './query.types'

/** The query is not valid GitHub code search syntax. */
export class QueryParseError extends TaggedError('QueryParseError')<{
  /** The part of the query that is wrong; zero-length when something is missing at that point. */
  readonly span: Span
  /** Human-readable summary, suitable for showing next to the query. */
  readonly message: string
}> {}
