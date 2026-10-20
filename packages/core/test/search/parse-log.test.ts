import { describe, expect, test } from 'bun:test'

import type { LoggedCommit } from '../../src/search/history.types'
import { createNameLogParser, diffPath, parseNameLog, parsePatchLog } from '../../src/search/parse-log'

describe('parseNameLog', () => {
  test('reads each commit and its files', () => {
    const [a, b] = ['a'.repeat(40), 'b'.repeat(40)]
    const output = `\x1e${a}\0\nsrc/a.ts\0b c.txt\0\x1e${b}\0\nx\0`
    expect(parseNameLog(output)).toEqual([
      { sha: a, files: ['src/a.ts', 'b c.txt'] },
      { sha: b, files: ['x'] },
    ])
  })

  test('streams commits as they complete, however the output is split', () => {
    const [a, b] = ['a'.repeat(40), 'b'.repeat(40)]
    const seen: LoggedCommit[] = []
    const parser = createNameLogParser(commit => seen.push(commit))
    for (const char of `\x1e${a}\0\nx\0y\0\x1e${b}\0\nz\0`) parser.push(char)
    expect(seen).toEqual([{ sha: a, files: ['x', 'y'] }])
    parser.end()
    expect(seen).toEqual([
      { sha: a, files: ['x', 'y'] },
      { sha: b, files: ['z'] },
    ])
  })

  test('a path holding the marker byte is still a path', () => {
    const sha = 'c'.repeat(40)
    expect(parseNameLog(`\x1e${sha}\0\na\x1eb\0\x1e\0`)).toEqual([{ sha, files: ['a\x1eb', '\x1e'] }])
  })

  test('nothing is no commits', () => {
    expect(parseNameLog('')).toEqual([])
  })
})

describe('diffPath', () => {
  test('removes the prefix and the tab after a name with spaces', () => {
    expect(diffPath('b/src/a.ts')).toBe('src/a.ts')
    expect(diffPath('a/d d/x.txt\t')).toBe('d d/x.txt')
  })

  test('undoes C-style quoting, including octal UTF-8 bytes', () => {
    expect(diffPath('"b/d d/x\\"y.txt"\t')).toBe('d d/x"y.txt')
    expect(diffPath('"b/caf\\303\\251\\tz"')).toBe('café\tz')
  })

  test('/dev/null is no path', () => {
    expect(diffPath('/dev/null')).toBeUndefined()
  })
})

describe('parsePatchLog', () => {
  const id = (short: string): string => short.padEnd(40, '0')
  const header = (sha: string, parent: string): string => `\x1e${id(sha)}\0${parent}\x002026-01-01T00:00:00Z\0Me\0subject\0\n`

  test('reads changed lines with their numbers on each side', () => {
    const output =
      header('c2', 'c1') +
      '\ndiff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n' +
      '@@ -2 +2,2 @@\n-old\n+new\n+@@ -9 +9 @@\n@@ -10,0 +12 @@\n+tail\r\n'
    expect(parsePatchLog(output)).toEqual([
      {
        fields: [id('c2'), 'c1', '2026-01-01T00:00:00Z', 'Me', 'subject'],
        files: [
          {
            path: 'a.ts',
            lines: [
              { change: 'removed', number: 2, text: 'old' },
              { change: 'added', number: 2, text: 'new' },
              { change: 'added', number: 3, text: '@@ -9 +9 @@' },
              { change: 'added', number: 12, text: 'tail' },
            ],
          },
        ],
      },
    ])
  })

  test('a deleted file keeps its old path, and a missing final newline is not a line', () => {
    const output =
      header('c3', 'c2') +
      '\ndiff --git a/gone.txt b/gone.txt\ndeleted file mode 100644\n--- a/gone.txt\n+++ /dev/null\n' +
      '@@ -1,2 +0,0 @@\n-one\n-two\n\\ No newline at end of file\n'
    expect(parsePatchLog(output)[0]?.files).toEqual([
      {
        path: 'gone.txt',
        lines: [
          { change: 'removed', number: 1, text: 'one' },
          { change: 'removed', number: 2, text: 'two' },
        ],
      },
    ])
  })

  test('the marker byte inside a changed line or a subject does not start a commit', () => {
    const output =
      '\x1e' + 'a'.repeat(40) + '\0\0d\0Me\0sub\x1eject\0\n' +
      '\ndiff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -0,0 +1 @@\n+x\x1e' + 'b'.repeat(40) + '\0needle\n'
    const [commit, ...rest] = parsePatchLog(output)
    expect(rest).toEqual([])
    expect(commit?.fields[4]).toBe('sub\x1eject')
    expect(commit?.files[0]?.lines).toEqual([{ change: 'added', number: 1, text: `x\x1e${'b'.repeat(40)}\0needle` }])
    expect(parsePatchLog('\x1enot a commit')).toEqual([])
  })

  test('context lines between hunks are counted but not kept', () => {
    const output =
      header('c2', 'c1') +
      '\ndiff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,5 +1,5 @@\n-a\n+A\n b\n c\n d\n-e\n+E\n' +
      'diff --git a/y b/y\n--- a/y\n+++ b/y\n@@ -2 +1,0 @@\n-gone\n'
    expect(parsePatchLog(output)[0]?.files).toEqual([
      {
        path: 'x',
        lines: [
          { change: 'removed', number: 1, text: 'a' },
          { change: 'added', number: 1, text: 'A' },
          { change: 'removed', number: 5, text: 'e' },
          { change: 'added', number: 5, text: 'E' },
        ],
      },
      { path: 'y', lines: [{ change: 'removed', number: 2, text: 'gone' }] },
    ])
  })

  test('a binary file without a patch is left out', () => {
    const output = header('c4', '') + '\ndiff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ\n'
    expect(parsePatchLog(output)).toEqual([{ fields: [id('c4'), '', '2026-01-01T00:00:00Z', 'Me', 'subject'], files: [] }])
  })
})
