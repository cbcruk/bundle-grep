/**
 * Tokens produced by {@linkcode tokenize} and consumed by {@linkcode parseQuery}.
 *
 * @module
 */

import type { FilterNode, MatchNode, Span } from './query.types'

/** A boolean operator keyword. Only the uppercase spellings are keywords. */
export type Keyword = 'AND' | 'OR' | 'NOT'

/** A boolean operator token. */
export interface KeywordToken {
  /** Discriminant. */
  kind: 'keyword'
  /** Which operator. */
  keyword: Keyword
  /** Where it appears. */
  span: Span
}

/** One token of a query. */
export type Token =
  | {
      /** An opening or closing parenthesis. */
      kind: 'lparen' | 'rparen'
      /** Where it appears. */
      span: Span
    }
  | KeywordToken
  | {
      /** A term or qualifier, already turned into its node. */
      kind: 'operand'
      /** The node, without any `-` negation applied. */
      node: MatchNode | FilterNode
      /** Whether the qualifier carried a `-` prefix. */
      negated: boolean
      /** Where it appears, including any `-` prefix. */
      span: Span
    }
