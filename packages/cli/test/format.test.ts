import { describe, expect, test } from 'bun:test'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { expandHome } from '../src/expand-home'
import { printable, stylesFor } from '../src/format/ansi'
import { formatQueryError } from '../src/format/query-error'
import { formatFile } from '../src/format/search-output'
import { formatFailure } from '../src/format/status-line'
import { batchSshEnv } from '../src/ssh-env'

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

describe('formatFailure', () => {
  test('keeps escapes from git and gh out of the terminal', () => {
    expect(formatFailure('a/b', 'remote: \x1b[31mhi\r\n', stylesFor(false))).toBe('failed    a/b: remote: �[31mhi��\n')
  })
})

describe('formatQueryError', () => {
  test('aligns the caret under wide, control and tab characters', () => {
    const error = { message: 'bad', span: { offset: 4, length: 1 } }
    expect(formatQueryError('한\x07\t (', error, stylesFor(false))).toBe('error: bad\n  한�  (\n       ^\n')
  })
})

describe('batchSshEnv', () => {
  test('sets BatchMode only when nobody is there and nothing else chose ssh', () => {
    const batch = { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' }
    expect(batchSshEnv({}, false, false)).toEqual(batch)
    expect(batchSshEnv({}, true, false)).toEqual({})
    expect(batchSshEnv({}, false, true)).toEqual({})
    expect(batchSshEnv({ GIT_SSH_COMMAND: 'ssh -i key' }, false, false)).toEqual({})
    expect(batchSshEnv({ GIT_SSH: 'plink' }, false, false)).toEqual({})
  })
})

describe('expandHome', () => {
  test('expands a leading ~ only', () => {
    expect(expandHome('~')).toBe(homedir())
    expect(expandHome('~/x')).toBe(join(homedir(), 'x'))
    expect(expandHome('a/~/x')).toBe('a/~/x')
    expect(expandHome('~user/x')).toBe('~user/x')
  })
})
