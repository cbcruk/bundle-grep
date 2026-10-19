/**
 * Parses GitHub code search queries, without the parts of the core that need
 * git or the file system, so a browser can check a query as it is typed.
 *
 * @example Underlining a mistake
 * ```ts
 * import { parseQuery } from "@bundle-grep/core/query";
 *
 * const parsed = parseQuery("useState (language:typescript");
 * if (parsed.isErr()) console.log(parsed.error.span); // { offset: 9, length: 1 }
 * ```
 *
 * @module
 */

export { parseQuery } from './parse-query'
export { QueryParseError } from './query.errors'
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
} from './query.types'
