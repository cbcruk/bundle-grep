import { describe, expect, test } from 'bun:test'

import { byteColumnToIndex, createHighlighter } from '../../src/search/match-ranges'

describe('createHighlighter', () => {
  test('every case-insensitive occurrence of a literal', () => {
    expect(createHighlighter([{ kind: 'literal', value: 'foo', quoted: false }])('Foo and foo')).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ])
  })

  test('regex metacharacters in a literal are literal', () => {
    expect(createHighlighter([{ kind: 'literal', value: 'a.b', quoted: false }])('axb a.b')).toEqual([
      { start: 4, end: 7 },
    ])
  })

  test('a regex, honouring a leading (?-i)', () => {
    const highlight = createHighlighter([{ kind: 'regex', source: '(?-i)True' }])
    expect(highlight('true True')).toEqual([{ start: 5, end: 9 }])
  })

  test('overlapping ranges from several patterns merge', () => {
    const highlight = createHighlighter([
      { kind: 'literal', value: 'useState', quoted: false },
      { kind: 'regex', source: 'State\\w*' },
    ])
    expect(highlight('useStateful')).toEqual([{ start: 0, end: 11 }])
  })

  test('a regex only PCRE understands gives no ranges', () => {
    expect(createHighlighter([{ kind: 'regex', source: 'a++' }])('aaa')).toEqual([])
  })

  test('empty matches are skipped without looping', () => {
    expect(createHighlighter([{ kind: 'regex', source: 'x*' }])('abc')).toEqual([])
  })
})

describe('byteColumnToIndex', () => {
  test('ASCII', () => {
    expect(byteColumnToIndex('two foo', 5)).toBe(4)
  })

  test('multi-byte characters before the match', () => {
    expect(byteColumnToIndex('héllo foo', 8)).toBe(6)
    expect(byteColumnToIndex('😀 foo', 6)).toBe(3)
  })
})
