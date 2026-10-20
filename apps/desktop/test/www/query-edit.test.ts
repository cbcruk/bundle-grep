import { describe, expect, test } from 'vitest'

import { facetToken, hasFacet, pathValue, quoteValue, toggleFacet } from '../../www/src/lib/query-edit'

describe('quoteValue', () => {
  test('leaves a plain word alone and quotes anything the tokenizer would split', () => {
    expect(quoteValue('TypeScript')).toBe('TypeScript')
    expect(quoteValue('Common Lisp')).toBe('"Common Lisp"')
    expect(quoteValue('a"b\\c')).toBe('"a\\"b\\\\c"')
    expect(quoteValue('f(x)')).toBe('"f(x)"')
    expect(quoteValue('')).toBe('""')
  })
})

describe('facets as qualifiers', () => {
  test('a directory becomes an anchored glob, and the root matches files outside any directory', () => {
    expect(pathValue('src')).toBe('/src/**')
    expect(pathValue('')).toBe('/*')
    expect(pathValue('my dir')).toBe('"my dir/"')
    expect(facetToken({ kind: 'language', value: 'Common Lisp' })).toBe('language:"Common Lisp"')
    expect(facetToken({ kind: 'repo', value: 'me/app' })).toBe('repo:me/app')
  })
})

describe('toggleFacet', () => {
  test('appends a qualifier the query lacks', () => {
    expect(toggleFacet('useState', { kind: 'language', value: 'TypeScript' })).toBe('useState language:TypeScript')
    expect(toggleFacet('  ', { kind: 'repo', value: 'me/app' })).toBe('repo:me/app')
    expect(toggleFacet('x', { kind: 'path', value: 'src' })).toBe('x path:/src/**')
  })

  test('removes a top-level qualifier the query has, however it was written', () => {
    expect(toggleFacet('useState language:typescript', { kind: 'language', value: 'TypeScript' })).toBe('useState')
    expect(toggleFacet('language:"common lisp" defun', { kind: 'language', value: 'Common Lisp' })).toBe('defun')
    expect(toggleFacet('a repo:Me/App b', { kind: 'repo', value: 'me/app' })).toBe('a b')
    expect(toggleFacet('x path:/src/**', { kind: 'path', value: 'src' })).toBe('x')
  })

  test('adding a facet drops its negation, which would leave nothing to match', () => {
    expect(toggleFacet('x -language:go', { kind: 'language', value: 'Go' })).toBe('x language:Go')
    expect(toggleFacet('NOT repo:me/app x', { kind: 'repo', value: 'me/app' })).toBe('x repo:me/app')
  })

  test('removing a facet removes every copy of it', () => {
    expect(toggleFacet('foo language:go language:Go', { kind: 'language', value: 'Go' })).toBe('foo')
  })

  test('a qualifier under an OR is not the facet, so the facet is added', () => {
    expect(toggleFacet('(x language:go) OR y', { kind: 'language', value: 'Go' })).toBe('((x language:go) OR y) language:Go')
  })

  test('parentheses around the whole query still leave its qualifiers at the top level', () => {
    expect(toggleFacet('(x language:go)', { kind: 'language', value: 'Go' })).toBe('(x)')
    expect(toggleFacet('(language:go x)', { kind: 'language', value: 'Go' })).toBe('(x)')
  })

  test('an OR at the top level is parenthesised so the qualifier applies to every alternative', () => {
    expect(toggleFacet('a OR b', { kind: 'repo', value: 'me/app' })).toBe('(a OR b) repo:me/app')
  })

  test('a query that does not parse just gets the qualifier appended', () => {
    expect(toggleFacet('a (b', { kind: 'repo', value: 'me/app' })).toBe('a (b repo:me/app')
  })

  test('toggling twice gives the query back', () => {
    for (const facet of [
      { kind: 'language', value: 'C++' },
      { kind: 'repo', value: 'me/app' },
      { kind: 'path', value: '' },
      { kind: 'path', value: 'my dir' },
    ] as const) {
      const added = toggleFacet('needle', facet)
      expect(hasFacet(added, facet)).toBe(true)
      expect(toggleFacet(added, facet)).toBe('needle')
    }
  })
})
