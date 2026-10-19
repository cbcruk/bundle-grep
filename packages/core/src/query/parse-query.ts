/**
 * Parses GitHub code search syntax into a {@linkcode QueryNode} tree.
 *
 * @module
 */

import { Result } from 'better-result'

import { QueryParseError } from './query.errors'
import type { QueryNode, Span } from './query.types'
import type { Keyword, KeywordToken, Token } from './token.types'
import { tokenize } from './tokenize'

type Parsed = Result<QueryNode, QueryParseError>

/** Deepest nesting of parentheses and `NOT`s accepted, well short of the call stack's limit. */
const MAX_NESTING = 256

function fail(message: string, span: Span): Parsed {
  return Result.err(new QueryParseError({ message, span }))
}

function after(span: Span): Span {
  return { offset: span.offset + span.length, length: 0 }
}

/** Joins operands, splicing in same-typed children so `a b AND c` is one flat node. */
function combine(type: 'and' | 'or', nodes: QueryNode[]): QueryNode {
  if (nodes.length === 1) return nodes[0]!
  return { type, children: nodes.flatMap(node => (node.type === type ? node.children : [node])) }
}

/**
 * A recursive-descent parser over the token list.
 *
 * Precedence, loosest first: `OR`, then `AND` (explicit or implied by
 * adjacency), then `NOT` and `-`.
 */
class Parser {
  #tokens: Token[]
  #queryLength: number
  #position = 0
  #depth = 0
  #nesting = 0

  constructor(tokens: Token[], queryLength: number) {
    this.#tokens = tokens
    this.#queryLength = queryLength
  }

  parse(): Parsed {
    if (this.#tokens.length === 0) return fail('Query is empty', { offset: this.#queryLength, length: 0 })

    const parsed = this.#parseOr()
    if (parsed.isErr()) return parsed

    const rest = this.#peek()
    if (rest) return fail('Unmatched closing parenthesis', rest.span)
    return parsed
  }

  #peek(): Token | undefined {
    return this.#tokens[this.#position]
  }

  #isKeyword(token: Token | undefined, keyword: Keyword): token is KeywordToken {
    return token?.kind === 'keyword' && token.keyword === keyword
  }

  #startsOperand(token: Token | undefined): boolean {
    return token?.kind === 'operand' || token?.kind === 'lparen' || this.#isKeyword(token, 'NOT')
  }

  /** Parses the operand following a keyword, failing at the keyword's end when there is none. */
  #parseAfter(keyword: KeywordToken): Parsed {
    if (!this.#startsOperand(this.#peek())) {
      return fail(`Expected a search term after ${keyword.keyword}`, after(keyword.span))
    }
    return this.#parseUnary()
  }

  #parseOr(): Parsed {
    const first = this.#parseAnd()
    if (first.isErr()) return first
    const nodes = [first.value]

    while (this.#isKeyword(this.#peek(), 'OR')) {
      const keyword = this.#tokens[this.#position++]!
      if (!this.#startsOperand(this.#peek())) return fail('Expected a search term after OR', after(keyword.span))
      const next = this.#parseAnd()
      if (next.isErr()) return next
      nodes.push(next.value)
    }
    return Result.ok(combine('or', nodes))
  }

  #parseAnd(): Parsed {
    const first = this.#parseUnary()
    if (first.isErr()) return first
    const nodes = [first.value]

    for (;;) {
      const token = this.#peek()
      let next: Parsed
      if (this.#isKeyword(token, 'AND')) {
        this.#position++
        next = this.#parseAfter(token)
      } else if (this.#startsOperand(token)) {
        next = this.#parseUnary()
      } else {
        break
      }
      if (next.isErr()) return next
      nodes.push(next.value)
    }
    return Result.ok(combine('and', nodes))
  }

  #parseUnary(): Parsed {
    const token = this.#peek()
    if (!token) return fail('Expected a search term', { offset: this.#queryLength, length: 0 })
    if (token.kind !== 'operand' && this.#nesting >= MAX_NESTING) {
      return fail(`Query is nested more than ${MAX_NESTING} levels deep`, token.span)
    }
    this.#position++

    switch (token.kind) {
      case 'operand':
        return Result.ok(token.negated ? { type: 'not', child: token.node } : token.node)

      case 'keyword': {
        if (token.keyword !== 'NOT') return fail(`Expected a search term before ${token.keyword}`, token.span)
        this.#nesting++
        const child = this.#parseAfter(token)
        this.#nesting--
        return child.map(child => ({ type: 'not', child }))
      }

      case 'rparen':
        return fail(this.#depth === 0 ? 'Unmatched closing parenthesis' : 'Expected a search term', token.span)

      case 'lparen': {
        const close = this.#peek()
        if (close?.kind === 'rparen') return fail('Expected a search term', close.span)

        this.#depth++
        this.#nesting++
        const inner = this.#parseOr()
        this.#depth--
        this.#nesting--
        if (inner.isErr()) return inner

        if (this.#peek()?.kind !== 'rparen') return fail('Missing closing parenthesis', token.span)
        this.#position++
        return inner
      }
    }
  }
}

/**
 * Parses a GitHub code search query.
 *
 * Supports bare words, `"quoted phrases"`, `/regular expressions/`, the
 * qualifiers `content:`, `path:`, `repo:`, `org:`, `user:`, `language:` and
 * `is:`, a `-` prefix to negate a qualifier, `AND`, `OR`, `NOT`, and
 * parentheses. A `key:value` with any other key is a plain search term, as on
 * GitHub.
 *
 * See {@link https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax}.
 *
 * @returns The query's tree, or a {@linkcode QueryParseError} pointing at the
 * offending part of the input.
 *
 * @example Parsing a query with a qualifier
 * ```ts
 * import { parseQuery } from "@bundle-grep/core";
 *
 * const result = parseQuery("useState language:typescript NOT path:test");
 *
 * if (result.isErr()) {
 *   console.error(result.error.message, result.error.span);
 * } else {
 *   console.log(result.value.type); // "and"
 * }
 * ```
 */
export function parseQuery(query: string): Result<QueryNode, QueryParseError> {
  return tokenize(query).andThen(tokens => new Parser(tokens, query.length).parse())
}
