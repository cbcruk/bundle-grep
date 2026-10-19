/**
 * Archives git repositories as bundles and searches them with GitHub-style
 * code search queries, run through `git grep`.
 *
 * @module
 */

export { parseQuery } from './query/parse-query'
export { QueryParseError } from './query/query.errors'
export type {
  AndNode,
  FilterKey,
  FilterNode,
  IsValue,
  MatchField,
  MatchNode,
  NotNode,
  OrNode,
  Pattern,
  QueryNode,
  Span,
} from './query/query.types'
