import { describe, expect, test } from 'bun:test'

import { printable, stylesFor } from '../src/format/ansi'
import { formatFile } from '../src/format/search-output'

describe('printable', () => {
  test('replaces control characters one for one, keeping tabs', () => {
    expect(printable('a\x1b]0;pwned\x07b\tc\x9bd')).toBe('a\ufffd]0;pwned\ufffdb\tc\ufffdd')
    expect(printable('한글 😀')).toBe('한글 😀')
  })
})

describe('formatFile', () => {
  test('highlights match ranges when coloring, without letting file text escape', () => {
    const line = { number: 2, text: 'x \x1b[2J foo', context: false, column: 7, ranges: [{ start: 7, end: 10 }] }
    const out = formatFile({ type: 'file', repo: 'a/b', path: 'f.ts', lines: [line] }, stylesFor(true), false)
    expect(out).toBe('\x1b[35mf.ts\x1b[39m:\x1b[32m2\x1b[39m:8:x \ufffd[2J \x1b[31m\x1b[1mfoo\x1b[22m\x1b[39m\n')
  })
})
