import { describe, expect, test } from 'bun:test'

import { parseGrepOutput } from '../../src/search/parse-grep-output'

function output(...records: string[]): Buffer {
  return Buffer.from(records.join(''))
}

describe('parseGrepOutput', () => {
  test('match and context lines, with the ref prefix removed', () => {
    expect(
      parseGrepOutput(output('HEAD:a b.txt\x001\x00one\n', 'HEAD:a b.txt\x002\x005\x00two foo\n', '--\n'), 'HEAD'),
    ).toEqual([
      { path: 'a b.txt', number: 1, byteColumn: undefined, text: 'one' },
      { path: 'a b.txt', number: 2, byteColumn: 5, text: 'two foo' },
    ])
  })

  test('a context line whose text is all digits', () => {
    expect(parseGrepOutput(output('HEAD:n\x003\x00123\n'), 'HEAD')).toEqual([
      { path: 'n', number: 3, byteColumn: undefined, text: '123' },
    ])
  })

  test('a path containing a newline', () => {
    expect(parseGrepOutput(output('main:odd\nname\x001\x001\x00foo\n'), 'main')).toEqual([
      { path: 'odd\nname', number: 1, byteColumn: 1, text: 'foo' },
    ])
  })

  test('non-ASCII text keeps its bytes', () => {
    expect(parseGrepOutput(output('HEAD:u.txt\x001\x008\x00héllo foo\n'), 'HEAD')).toEqual([
      { path: 'u.txt', number: 1, byteColumn: 8, text: 'héllo foo' },
    ])
  })

  test('a CRLF line loses its carriage return', () => {
    expect(parseGrepOutput(output('HEAD:w\x001\x001\x00foo\r\n'), 'HEAD')).toEqual([
      { path: 'w', number: 1, byteColumn: 1, text: 'foo' },
    ])
  })

  test('empty output', () => {
    expect(parseGrepOutput(Buffer.alloc(0), 'HEAD')).toEqual([])
  })
})
