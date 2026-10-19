/**
 * The ways a parsed query can fail to compile.
 *
 * @module
 */

import { TaggedError } from 'better-result'

import type { Span } from '../query/query.types'

/** The query parsed, but cannot be turned into a search. */
export class QueryCompileError extends TaggedError('QueryCompileError')<{
  /** The part of the query that is wrong. */
  readonly span: Span
  /** Human-readable summary, suitable for showing next to the query. */
  readonly message: string
}> {}
