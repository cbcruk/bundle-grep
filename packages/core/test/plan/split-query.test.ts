import { describe, expect, test } from 'bun:test'

import { compileQuery } from '../../src/plan/compile-query'
import { parseQuery } from '../../src/query/parse-query'

function plan(query: string): ReturnType<typeof compileQuery> {
  return compileQuery(parseQuery(query).unwrap())
}

function error(query: string): { message: string; offset: number; length: number } {
  const result = plan(query)
  if (result.isOk()) throw new Error(`expected "${query}" to fail`)
  return { message: result.error.message, ...result.error.span }
}

describe('ref:', () => {
  test('is taken out of the query into the plan', () => {
    const compiled = plan('ref:v1.0 foo').unwrap()
    expect(compiled.ref).toBe('v1.0')
    expect(compiled.expr).toMatchObject({ op: 'or' })
    expect(plan('foo').unwrap().ref).toBeUndefined()
  })

  test('alone searches every file at the ref', () => {
    expect(plan('ref:main').unwrap()).toMatchObject({ ref: 'main', expr: { op: 'all' } })
  })

  test('accepts branches with slashes, tags, commit ids, and relative revisions', () => {
    for (const ref of ['feature/x', 'v2.0.0', 'a1b2c3d', 'HEAD~3', 'main^']) expect(plan(`ref:${ref}`).unwrap().ref).toBe(ref)
  })

  test('rejects what git could read as an option, a range, or a path', () => {
    expect(error('ref:-x foo')).toEqual({ message: '"-x" is not a branch, tag, or commit', offset: 0, length: 6 })
    expect(error('ref:a..b').message).toBe('"a..b" is not a branch, tag, or commit')
    expect(error('ref:HEAD:src').message).toBe('"HEAD:src" is not a branch, tag, or commit')
  })

  test('appears at most once, at the top level', () => {
    expect(error('ref:a ref:b')).toEqual({ message: 'Only one ref: can be searched at a time', offset: 6, length: 5 })
    expect(error('foo -ref:a')).toEqual({ message: 'ref: cannot be negated or combined with OR', offset: 5, length: 5 })
    expect(error('foo OR ref:a').message).toBe('ref: cannot be negated or combined with OR')
  })
})

describe('history:', () => {
  test('escapes a literal and matches it ignoring case', () => {
    expect(plan('history:a.b').unwrap().history).toEqual({
      regex: 'a\\.b',
      ignoreCase: true,
      pattern: { kind: 'literal', value: 'a.b', quoted: false },
    })
  })

  test('passes a regex through, made case-sensitive by a leading (?-i)', () => {
    expect(plan('history:/foo[0-9]+/').unwrap().history).toMatchObject({ regex: 'foo[0-9]+', ignoreCase: true })
    expect(plan('history:/(?-i)Foo/').unwrap().history).toMatchObject({ regex: 'Foo', ignoreCase: false })
  })

  test('combines with path:, language:, repository qualifiers, and ref:', () => {
    const compiled = plan('history:foo path:src language:ts repo:a/b is:fork ref:dev').unwrap()
    expect(compiled).toMatchObject({ ref: 'dev', history: { regex: 'foo' } })
    expect(plan('history:foo').unwrap().expr).toEqual({ op: 'all' })
  })

  test('rejects terms that match file contents or definitions', () => {
    const message = 'history: can only be combined with path:, language:, repo:, org:, user:, is:, and ref:'
    expect(error('history:foo bar')).toEqual({ message, offset: 12, length: 3 })
    expect(error('history:foo (path:a OR symbol:b)')).toMatchObject({ message, offset: 23, length: 8 })
    expect(error('history:foo -content:x').message).toBe(message)
  })

  test('appears at most once, at the top level', () => {
    expect(error('history:a history:b').message).toBe('Only one history: can be searched at a time')
    expect(error('foo OR history:a')).toEqual({ message: 'history: cannot be negated or combined with OR', offset: 7, length: 9 })
    expect(error('-history:a').message).toBe('history: cannot be negated or combined with OR')
  })
})
