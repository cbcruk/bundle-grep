import { describe, expect, test } from 'bun:test'
import { rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { expandHome } from '../src/expand-home'
import { printable, stylesFor } from '../src/format/ansi'
import { formatQueryError } from '../src/format/query-error'
import { formatFile } from '../src/format/search-output'
import { formatFailure } from '../src/format/status-line'
import { batchSshEnv, hasSshCommandConfig } from '../src/ssh-env'

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
    expect(formatFailure('a/b', 'remote: \x1b[31mhi\r\n', stylesFor(false))).toBe('failed    a/b: remote: \ufffd[31mhi\n')
    expect(formatFailure('a/b', 'fatal: one\r\nfatal: two\n\n', stylesFor(false))).toBe('failed    a/b: fatal: one\n    fatal: two\n')
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

describe('hasSshCommandConfig', () => {
  test('reads global config, not the repository it runs from', () => {
    const saved = { GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM }
    const config = join(tmpdir(), `bundle-grep-ssh-${process.pid}`)
    writeFileSync(config, '[core]\n\tsshCommand = ssh -i key\n')
    Object.assign(process.env, { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' })
    try {
      expect(hasSshCommandConfig()).toBe(true)
      process.env.GIT_CONFIG_GLOBAL = '/dev/null'
      expect(hasSshCommandConfig()).toBe(false)
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      rmSync(config, { force: true })
    }
  })
})
