import { describe, expect, test } from 'bun:test'

import { parseQuery } from '../../src/query/parse-query'
import type { QueryNode } from '../../src/query/query.types'

/** Parses and drops spans, so tree shapes can be compared directly. */
function tree(query: string): unknown {
  return strip(parseQuery(query).unwrap())
}

function strip(node: QueryNode): unknown {
  switch (node.type) {
    case 'match':
      return { match: node.field, ...node.pattern }
    case 'filter':
      return { filter: node.key, value: node.value }
    case 'not':
      return { not: strip(node.child) }
    case 'and':
    case 'or':
      return { [node.type]: node.children.map(strip) }
  }
}

function error(query: string): { message: string; offset: number; length: number } {
  const result = parseQuery(query)
  if (result.isOk()) throw new Error(`expected "${query}" to fail`)
  return { message: result.error.message, ...result.error.span }
}

const term = (value: string, quoted = false): unknown => ({ match: 'any', kind: 'literal', value, quoted })

const pathLiteral = (value: string, quoted = false): unknown => ({ match: 'path', kind: 'literal', value, quoted })

describe('terms', () => {
  test('a bare word', () => {
    expect(tree('useState')).toEqual(term('useState'))
  })

  test('a quoted phrase keeps whitespace', () => {
    expect(tree('"sparse index"')).toEqual(term('sparse index', true))
  })

  test('escaped quotes and backslashes inside a phrase', () => {
    expect(tree('"say \\"hi\\" \\\\ bye"')).toEqual(term('say "hi" \\ bye', true))
  })

  test('a quoted keyword is a literal', () => {
    expect(tree('"OR"')).toEqual(term('OR', true))
  })

  test('lowercase keywords are terms', () => {
    expect(tree('not')).toEqual(term('not'))
  })

  test('a regex', () => {
    expect(tree('/sparse.*index/')).toEqual({ match: 'any', kind: 'regex', source: 'sparse.*index' })
  })

  test('an escaped slash inside a regex', () => {
    expect(tree('/^src\\/.*\\.ts$/')).toEqual({ match: 'any', kind: 'regex', source: '^src/.*\\.ts$' })
  })

  test('other escapes in a regex are passed through', () => {
    expect(tree('/\\d+\\s/')).toEqual({ match: 'any', kind: 'regex', source: '\\d+\\s' })
  })

  test('a slash inside a bare word is not a regex', () => {
    expect(tree('a/b')).toEqual(term('a/b'))
  })

  test('balanced parentheses stay inside a word', () => {
    expect(tree('getValue()')).toEqual(term('getValue()'))
  })

  test('an opening parenthesis inside a word is literal', () => {
    expect(tree('getValue(')).toEqual(term('getValue('))
  })

  test('a leading dash on a bare word is part of the word', () => {
    expect(tree('-foo')).toEqual(term('-foo'))
  })

  test('an unknown qualifier is a term', () => {
    expect(tree('http://example.com')).toEqual(term('http://example.com'))
  })
})

describe('qualifiers', () => {
  test('content: matches only contents', () => {
    expect(tree('content:README')).toEqual({ match: 'content', kind: 'literal', value: 'README', quoted: false })
  })

  test('path: matches only paths', () => {
    expect(tree('path:src/*.ts')).toEqual(pathLiteral('src/*.ts'))
  })

  test('a quoted path: records that it was quoted, so globs can be turned off', () => {
    expect(tree('path:"file?"')).toEqual(pathLiteral('file?', true))
  })

  test('path: takes a regex', () => {
    expect(tree('path:/\\.test\\.ts$/')).toEqual({ match: 'path', kind: 'regex', source: '\\.test\\.ts$' })
  })

  test('a quoted qualifier value', () => {
    expect(tree('language:"Common Lisp"')).toEqual({ filter: 'language', value: 'Common Lisp' })
  })

  test.each(['repo', 'org', 'user', 'language'] as const)('%s: is a filter', key => {
    expect(tree(`${key}:value`)).toEqual({ filter: key, value: 'value' })
  })

  test.each(['fork', 'archived'])('is:%s', value => {
    expect(tree(`is:${value}`)).toEqual({ filter: 'is', value })
  })

  test('a dash negates a qualifier', () => {
    expect(tree('-path:vendor')).toEqual({ not: pathLiteral('vendor') })
  })

  test('qualifier keys are case-insensitive', () => {
    expect(tree('Language:TypeScript')).toEqual({ filter: 'language', value: 'TypeScript' })
  })
})

describe('boolean operators', () => {
  test('adjacent terms are ANDed', () => {
    expect(tree('foo bar')).toEqual({ and: [term('foo'), term('bar')] })
  })

  test('an explicit AND', () => {
    expect(tree('foo AND bar')).toEqual({ and: [term('foo'), term('bar')] })
  })

  test('OR', () => {
    expect(tree('foo OR bar')).toEqual({ or: [term('foo'), term('bar')] })
  })

  test('NOT', () => {
    expect(tree('foo NOT bar')).toEqual({ and: [term('foo'), { not: term('bar') }] })
  })

  test('AND binds tighter than OR', () => {
    expect(tree('a OR b c')).toEqual({ or: [term('a'), { and: [term('b'), term('c')] }] })
  })

  test('NOT binds tighter than AND', () => {
    expect(tree('NOT a b')).toEqual({ and: [{ not: term('a') }, term('b')] })
  })

  test('chains flatten', () => {
    expect(tree('a OR b OR c')).toEqual({ or: [term('a'), term('b'), term('c')] })
    expect(tree('a b AND c')).toEqual({ and: [term('a'), term('b'), term('c')] })
  })

  test('parentheses group', () => {
    expect(tree('(a OR b) c')).toEqual({ and: [{ or: [term('a'), term('b')] }, term('c')] })
  })

  test('NOT applies to a group', () => {
    expect(tree('NOT (a OR b)')).toEqual({ not: { or: [term('a'), term('b')] } })
  })

  test('a closing parenthesis ends a word inside a group', () => {
    expect(tree('(a OR foo)')).toEqual({ or: [term('a'), term('foo')] })
  })

  test('a word with balanced parentheses inside a group', () => {
    expect(tree('(foo() OR bar)')).toEqual({ or: [term('foo()'), term('bar')] })
  })

  test('qualifiers combine with terms', () => {
    expect(tree('useState language:typescript NOT path:test')).toEqual({
      and: [term('useState'), { filter: 'language', value: 'typescript' }, { not: pathLiteral('test') }],
    })
  })

  test('a keyword directly before a group', () => {
    expect(tree('NOT(a OR b)')).toEqual({ not: { or: [term('a'), term('b')] } })
    expect(tree('a OR(b)')).toEqual({ or: [term('a'), term('b')] })
  })

  test('a word directly before a group keeps its parenthesis, so the group cannot close', () => {
    expect(error('x(a OR b)')).toEqual({ message: 'Unmatched closing parenthesis', offset: 8, length: 1 })
  })

  test('nesting up to the limit', () => {
    expect(tree(`${'('.repeat(256)}a${')'.repeat(256)}`)).toEqual(term('a'))
  })

  test('surrounding whitespace is ignored', () => {
    expect(tree('  foo  ')).toEqual(term('foo'))
  })
})

describe('spans', () => {
  test('a term covers its source', () => {
    expect(parseQuery('foo "a b"').unwrap()).toMatchObject({
      children: [{ span: { offset: 0, length: 3 } }, { span: { offset: 4, length: 5 } }],
    })
  })

  test('a negated qualifier covers the key and value, not the dash', () => {
    expect(parseQuery('-path:vendor').unwrap()).toMatchObject({ child: { span: { offset: 1, length: 11 } } })
  })

  test('the not of a negated qualifier covers the dash', () => {
    expect(parseQuery('-path:vendor').unwrap()).toMatchObject({ type: 'not', span: { offset: 0, length: 12 } })
  })

  test('and and or run from the first operand to the last', () => {
    expect(parseQuery(' a b OR c ').unwrap()).toMatchObject({
      type: 'or',
      span: { offset: 1, length: 8 },
      children: [{ type: 'and', span: { offset: 1, length: 3 } }, { span: { offset: 8, length: 1 } }],
    })
  })

  test('parentheses widen the operand they wrap', () => {
    expect(parseQuery('(a b) OR c').unwrap()).toMatchObject({
      span: { offset: 0, length: 10 },
      children: [{ type: 'and', span: { offset: 1, length: 3 } }, {}],
    })
    expect(parseQuery('x ((a OR b))').unwrap()).toMatchObject({
      type: 'and',
      span: { offset: 0, length: 12 },
      children: [{}, { type: 'or', span: { offset: 4, length: 6 } }],
    })
  })

  test('NOT covers the keyword through its operand', () => {
    expect(parseQuery('x NOT (a b)').unwrap()).toMatchObject({
      children: [{}, { type: 'not', span: { offset: 2, length: 9 }, child: { span: { offset: 7, length: 3 } } }],
    })
  })

  test('a flattened and covers every operand', () => {
    expect(parseQuery('(a b) c').unwrap()).toMatchObject({ type: 'and', span: { offset: 0, length: 7 } })
  })
})

describe('escapes outside quotes', () => {
  test('a backslash escapes a quote or a backslash', () => {
    expect(tree('say\\"hi\\"')).toEqual(term('say"hi"'))
    expect(tree('C:\\\\Windows')).toEqual(term('C:\\Windows'))
  })

  test('an escaped quote does not start a phrase', () => {
    expect(tree('\\"a b')).toEqual({ and: [term('"a'), term('b')] })
  })

  test('other backslashes are kept', () => {
    expect(tree('a\\nb \\')).toEqual({ and: [term('a\\nb'), term('\\')] })
  })

  test('qualifier values unescape too', () => {
    expect(tree('repo:a\\"b path:x\\\\y')).toEqual({
      and: [{ filter: 'repo', value: 'a"b' }, pathLiteral('x\\y')],
    })
  })

  test('the span still covers the escapes', () => {
    expect(parseQuery('a\\"b').unwrap()).toMatchObject({ span: { offset: 0, length: 4 } })
  })
})

describe('errors', () => {
  test('an empty query', () => {
    expect(error('   ')).toEqual({ message: 'Query is empty', offset: 3, length: 0 })
  })

  test('an unterminated phrase', () => {
    expect(error('foo "bar')).toEqual({ message: 'Unterminated quoted phrase', offset: 4, length: 4 })
  })

  test('an unterminated regex', () => {
    expect(error('/abc')).toEqual({ message: 'Unterminated regular expression', offset: 0, length: 4 })
  })

  test('an empty regex', () => {
    expect(error('//')).toEqual({ message: 'Regular expression is empty', offset: 0, length: 2 })
  })

  test('an empty phrase', () => {
    expect(error('""')).toEqual({ message: 'Quoted phrase is empty', offset: 0, length: 2 })
  })

  test('nesting past the limit fails instead of overflowing the stack', () => {
    expect(error(`${'('.repeat(20000)}a${')'.repeat(20000)}`)).toEqual({
      message: 'Query is nested more than 256 levels deep',
      offset: 256,
      length: 1,
    })
    expect(error(`${'NOT '.repeat(20000)}a`)).toMatchObject({ message: 'Query is nested more than 256 levels deep' })
  })

  test('errors at the nesting limit keep their own message', () => {
    expect(error(`${'('.repeat(256)}a OR`)).toMatchObject({ message: 'Expected a search term after OR' })
  })

  test('a GitHub qualifier that is not supported', () => {
    expect(error('-symbol:foo')).toEqual({ message: 'Qualifier symbol: is not supported', offset: 1, length: 7 })
  })

  test('an unclosed group', () => {
    expect(error('(a OR b')).toEqual({ message: 'Missing closing parenthesis', offset: 0, length: 1 })
  })

  test('an unmatched closing parenthesis', () => {
    expect(error('a)')).toEqual({ message: 'Unmatched closing parenthesis', offset: 1, length: 1 })
  })

  test('an empty group', () => {
    expect(error('a ()')).toEqual({ message: 'Expected a search term', offset: 3, length: 1 })
  })

  test('a dangling operator', () => {
    expect(error('a OR')).toEqual({ message: 'Expected a search term after OR', offset: 4, length: 0 })
    expect(error('NOT')).toEqual({ message: 'Expected a search term after NOT', offset: 3, length: 0 })
  })

  test('a leading operator', () => {
    expect(error('OR a')).toEqual({ message: 'Expected a search term before OR', offset: 0, length: 2 })
  })

  test('a qualifier without a value', () => {
    expect(error('path:')).toEqual({ message: 'Qualifier path: needs a value', offset: 0, length: 5 })
  })

  test('an unsupported is: value', () => {
    expect(error('is:vendored')).toEqual({
      message: 'Unsupported value for is: "vendored" (expected fork or archived)',
      offset: 3,
      length: 8,
    })
  })

  test('a filter given a regex', () => {
    expect(error('repo:/abc/')).toEqual({ message: 'Qualifier repo: does not accept a regular expression', offset: 5, length: 5 })
  })
})

describe('path: with a leading slash', () => {
  test('an anchored glob is a literal, not a regex', () => {
    expect(tree('path:/src/**/*.js')).toEqual({ match: 'path', kind: 'literal', value: '/src/**/*.js', quoted: false })
  })

  test('an anchored prefix without a closing slash is a literal', () => {
    expect(tree('path:/src')).toEqual({ match: 'path', kind: 'literal', value: '/src', quoted: false })
  })

  test('a regex followed by the end of the term stays a regex', () => {
    expect(tree('path:/^src\\// foo')).toEqual({
      and: [{ match: 'path', kind: 'regex', source: '^src/' }, term('foo')],
    })
  })
})
