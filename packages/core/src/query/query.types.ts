/**
 * The syntax tree a GitHub code search query parses into.
 *
 * @module
 */

/** A range of the original query string, for pointing at it in messages and highlights. */
export interface Span {
  /** Index of the first character, counted in UTF-16 code units. */
  offset: number
  /** Number of UTF-16 code units covered. */
  length: number
}

/**
 * A pattern to look for: a fixed string, or a regular expression.
 *
 * Bare words and quoted phrases are both `literal`. Quoting lets a literal
 * contain whitespace, parentheses, or a keyword, and for `path:` it also turns
 * glob characters off, as on GitHub — hence `quoted`. A `regex` source is
 * passed to git uninterpreted, so it is not validated here.
 */
export type Pattern =
  | {
      /** A fixed string. */
      kind: 'literal'
      /** The string, with quotes and escapes removed. */
      value: string
      /** Whether it was written as a `"quoted phrase"`. */
      quoted: boolean
    }
  | {
      /** A regular expression, from `/.../`. */
      kind: 'regex'
      /** The expression between the slashes, with `\/` unescaped. */
      source: string
    }

/**
 * Where a {@linkcode MatchNode} looks.
 *
 * - `any`: a file's contents or its path — what a bare term searches on GitHub.
 * - `content`: only the contents, from `content:`.
 * - `path`: only the path, from `path:`.
 */
export type MatchField = 'any' | 'content' | 'path'

/** A pattern that has to match a file's contents or path. */
export interface MatchNode {
  /** Discriminant. */
  type: 'match'
  /** What the pattern is matched against. */
  field: MatchField
  /** What to look for. */
  pattern: Pattern
  /** The source of this node, including any qualifier key. */
  span: Span
}

/** Qualifier keys that select repositories or files rather than matching text. */
export type FilterKey = 'repo' | 'org' | 'user' | 'language' | 'is'

/** Values accepted by the `is:` qualifier. */
export type IsValue = 'fork' | 'archived'

/** A qualifier that narrows which repositories or files are searched. */
export interface FilterNode {
  /** Discriminant. */
  type: 'filter'
  /** The qualifier key. */
  key: FilterKey
  /** The qualifier value, with quotes removed. For `is:` this is an {@linkcode IsValue}. */
  value: string
  /** The source of this node, including the key. */
  span: Span
}

/** A node that holds only when every child holds. */
export interface AndNode {
  /** Discriminant. */
  type: 'and'
  /** Two or more operands. */
  children: QueryNode[]
  /** From the first operand to the last, including any parentheses around them. */
  span: Span
}

/** A node that holds when any child holds. */
export interface OrNode {
  /** Discriminant. */
  type: 'or'
  /** Two or more operands. */
  children: QueryNode[]
  /** From the first operand to the last, including any parentheses around them. */
  span: Span
}

/** A node that holds when its child does not, from `NOT` or a `-` prefix on a qualifier. */
export interface NotNode {
  /** Discriminant. */
  type: 'not'
  /** The negated operand. */
  child: QueryNode
  /** From the `NOT` or `-` to the end of the operand, including any parentheses around it. */
  span: Span
}

/** Any node of a parsed query. */
export type QueryNode = MatchNode | FilterNode | AndNode | OrNode | NotNode
