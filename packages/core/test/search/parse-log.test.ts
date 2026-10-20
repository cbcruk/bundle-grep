import { describe, expect, test } from 'bun:test'

import { diffPath, parseNameLog, parsePatchLog } from '../../src/search/parse-log'

describe('parseNameLog', () => {
  test('reads each commit and its files', () => {
    const output = '\x1eaaa\0\nsrc/a.ts\0b c.txt\0\x1ebbb\0\nx\0'
    expect(parseNameLog(output)).toEqual([
      { sha: 'aaa', files: ['src/a.ts', 'b c.txt'] },
      { sha: 'bbb', files: ['x'] },
    ])
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
  const header = (sha: string, parent: string): string => `\x1e${sha}\0${parent}\x002026-01-01T00:00:00Z\0Me\0subject\0\n`

  test('reads changed lines with their numbers on each side', () => {
    const output =
      header('c2', 'c1') +
      '\ndiff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n' +
      '@@ -2 +2,2 @@\n-old\n+new\n+@@ -9 +9 @@\n@@ -10,0 +12 @@\n+tail\r\n'
    expect(parsePatchLog(output)).toEqual([
      {
        fields: ['c2', 'c1', '2026-01-01T00:00:00Z', 'Me', 'subject'],
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

  test('a binary file without a patch is left out', () => {
    const output = header('c4', '') + '\ndiff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ\n'
    expect(parsePatchLog(output)).toEqual([{ fields: ['c4', '', '2026-01-01T00:00:00Z', 'Me', 'subject'], files: [] }])
  })
})
