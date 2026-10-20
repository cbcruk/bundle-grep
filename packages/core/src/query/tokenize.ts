/**
 * Splits a query string into {@linkcode Token}s.
 *
 * @module
 */

import { Result } from 'better-result'

import { QueryParseError } from './query.errors'
import type { FilterKey, FilterNode, IsValue, MatchField, MatchNode, Pattern, Span } from './query.types'
import type { Keyword, Token } from './token.types'

const KEYWORDS: ReadonlySet<string> = new Set<Keyword>(['AND', 'OR', 'NOT'])

const MATCH_KEYS: Readonly<Record<string, MatchField>> = { content: 'content', path: 'path', symbol: 'symbol', history: 'history' }

const FILTER_KEYS: ReadonlySet<string> = new Set<FilterKey>(['repo', 'org', 'user', 'language', 'is', 'ref'])

const IS_VALUES: ReadonlySet<string> = new Set<IsValue>(['fork', 'archived'])

const UNSUPPORTED_KEYS: ReadonlySet<string> = new Set(['enterprise'])

const QUALIFIER = /^(-?)([A-Za-z]+):/

const KEYWORD_BEFORE_GROUP = /^(AND|OR|NOT)(?=\()/

interface Scanned<T> {
  value: T
  end: number
}

type ScanResult<T> = Result<Scanned<T>, QueryParseError>

function span(offset: number, end: number): Span {
  return { offset, length: end - offset }
}

function fail<T>(message: string, offset: number, end: number): Result<T, QueryParseError> {
  return Result.err(new QueryParseError({ message, span: span(offset, end) }))
}

function isSpace(char: string | undefined): boolean {
  return char !== undefined && /\s/.test(char)
}

/** Reads a `"..."` phrase starting at `start`, unescaping `\"` and `\\`. */
function scanQuoted(query: string, start: number): ScanResult<string> {
  let value = ''
  for (let i = start + 1; i < query.length; i++) {
    const char = query[i]!
    if (char === '"') {
      if (value === '') return fail('Quoted phrase is empty', start, i + 1)
      return Result.ok({ value, end: i + 1 })
    }
    if (char === '\\' && (query[i + 1] === '"' || query[i + 1] === '\\')) {
      value += query[++i]
      continue
    }
    value += char
  }
  return fail('Unterminated quoted phrase', start, query.length)
}

/** Reads a `/.../` expression starting at `start`, unescaping `\/` and leaving other escapes for git. */
function scanRegex(query: string, start: number): ScanResult<string> {
  let source = ''
  for (let i = start + 1; i < query.length; i++) {
    const char = query[i]!
    if (char === '/') {
      if (source === '') return fail('Regular expression is empty', start, i + 1)
      return Result.ok({ value: source, end: i + 1 })
    }
    if (char === '\\' && i + 1 < query.length) {
      const next = query[++i]!
      source += next === '/' ? '/' : `\\${next}`
      continue
    }
    source += char
  }
  return fail('Unterminated regular expression', start, query.length)
}

/**
 * Reads a bare word starting at `start`, unescaping `\"` and `\\` as GitHub
 * does outside quotes too.
 *
 * Whitespace ends it, and so does a `)` the word did not open itself, which is
 * what lets `(a OR foo)` close its group while `getValue()` stays one word.
 */
function scanWord(query: string, start: number): Scanned<string> {
  let depth = 0
  let value = ''
  let i = start
  for (; i < query.length; i++) {
    const char = query[i]!
    if (isSpace(char)) break
    if (char === '\\' && (query[i + 1] === '"' || query[i + 1] === '\\')) {
      value += query[++i]
      continue
    }
    if (char === '(') depth++
    if (char === ')') {
      if (depth === 0) break
      depth--
    }
    value += char
  }
  return { value, end: i }
}

/** Reads a pattern, as a phrase, a regex, or a bare word depending on its first character. */
function scanPattern(query: string, start: number): ScanResult<Pattern> {
  if (query[start] === '"') {
    return scanQuoted(query, start).map(({ value, end }) => ({
      value: { kind: 'literal', value, quoted: true },
      end,
    }))
  }
  if (query[start] === '/') {
    return scanRegex(query, start).map(({ value, end }) => ({ value: { kind: 'regex', source: value }, end }))
  }
  const { value, end } = scanWord(query, start)
  return Result.ok({ value: { kind: 'literal', value, quoted: false }, end })
}

/**
 * Reads a `path:` value, where a leading `/` is either a regex or GitHub's
 * start-of-path anchor.
 *
 * It is a regex only when a closing `/` ends the term; `/src/**\/*.js` and
 * `/src` are anchored paths and stay literal.
 */
function scanPathPattern(query: string, start: number): ScanResult<Pattern> {
  if (query[start] === '/') {
    const regex = scanRegex(query, start)
    const next = regex.isOk() ? query[regex.value.end] : undefined
    if (regex.isOk() && (next === undefined || isSpace(next) || next === ')')) {
      return Result.ok({ value: { kind: 'regex', source: regex.value.value }, end: regex.value.end })
    }
    const { value, end } = scanWord(query, start)
    return Result.ok({ value: { kind: 'literal', value, quoted: false }, end })
  }
  return scanPattern(query, start)
}

/** Reads a known qualifier whose key starts at `keyStart` and whose value starts at `valueStart`. */
function scanQualifier(
  query: string,
  key: string,
  keyStart: number,
  valueStart: number,
): ScanResult<MatchNode | FilterNode> {
  const char = query[valueStart]
  if (char === undefined || isSpace(char) || char === ')') {
    return fail(`Qualifier ${key}: needs a value`, keyStart, valueStart)
  }

  const field = MATCH_KEYS[key]
  const scanned = field === 'path' ? scanPathPattern(query, valueStart) : scanPattern(query, valueStart)
  if (scanned.isErr()) return Result.err(scanned.error)
  const { value: pattern, end } = scanned.value

  if (field) {
    return Result.ok({ value: { type: 'match', field, pattern, span: span(keyStart, end) }, end })
  }

  if (pattern.kind === 'regex') {
    return fail(`Qualifier ${key}: does not accept a regular expression`, valueStart, end)
  }
  if (key === 'is' && !IS_VALUES.has(pattern.value)) {
    return fail(
      `Unsupported value for is: "${pattern.value}" (expected ${[...IS_VALUES].join(' or ')})`,
      valueStart,
      end,
    )
  }
  return Result.ok({
    value: { type: 'filter', key: key as FilterKey, value: pattern.value, span: span(keyStart, end) },
    end,
  })
}

/** Reads the token starting at `start`, which is not whitespace. */
function scanToken(query: string, start: number): ScanResult<Token> {
  const char = query[start]
  if (char === '(' || char === ')') {
    const kind = char === '(' ? 'lparen' : 'rparen'
    return Result.ok({ value: { kind, span: span(start, start + 1) }, end: start + 1 })
  }

  // `NOT(a)` and `a OR(b)` would otherwise read as words that opened their own parenthesis.
  const keyword = KEYWORD_BEFORE_GROUP.exec(query.slice(start))?.[1]
  if (keyword) {
    const end = start + keyword.length
    return Result.ok({ value: { kind: 'keyword', keyword: keyword as Keyword, span: span(start, end) }, end })
  }

  const qualifier = QUALIFIER.exec(query.slice(start))
  const key = qualifier?.[2]?.toLowerCase()
  if (qualifier && key && UNSUPPORTED_KEYS.has(key)) {
    const keyStart = start + qualifier[1]!.length
    return fail(`Qualifier ${key}: is not supported`, keyStart, start + qualifier[0].length)
  }
  if (qualifier && key && (key in MATCH_KEYS || FILTER_KEYS.has(key))) {
    const negated = qualifier[1] === '-'
    const keyStart = start + (negated ? 1 : 0)
    const scanned = scanQualifier(query, key, keyStart, start + qualifier[0].length)
    if (scanned.isErr()) return Result.err(scanned.error)
    const { value: node, end } = scanned.value
    return Result.ok({
      value: { kind: 'operand', node, negated, span: span(start, end) },
      end,
    })
  }

  const scanned = scanPattern(query, start)
  if (scanned.isErr()) return Result.err(scanned.error)
  const { value: pattern, end } = scanned.value

  if (pattern.kind === 'literal' && char !== '"' && KEYWORDS.has(pattern.value)) {
    return Result.ok({
      value: { kind: 'keyword', keyword: pattern.value as Keyword, span: span(start, end) },
      end,
    })
  }
  return Result.ok({
    value: {
      kind: 'operand',
      node: { type: 'match', field: 'any', pattern, span: span(start, end) },
      negated: false,
      span: span(start, end),
    },
    end,
  })
}

/**
 * Splits a GitHub code search query into tokens.
 *
 * Terms and qualifiers come out as finished leaf nodes, so the parser deals
 * only with operators and grouping.
 *
 * @returns The tokens in order, or the first lexical error.
 */
export function tokenize(query: string): Result<Token[], QueryParseError> {
  const tokens: Token[] = []
  let i = 0
  while (i < query.length) {
    if (isSpace(query[i])) {
      i++
      continue
    }
    const scanned = scanToken(query, i)
    if (scanned.isErr()) return Result.err(scanned.error)
    tokens.push(scanned.value.value)
    i = scanned.value.end
  }
  return Result.ok(tokens)
}
