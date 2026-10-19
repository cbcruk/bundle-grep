import { describe, expect, test } from 'bun:test'

import type { SearchLine } from '@bundle-grep/core'

import { blobLines } from '../../www/src/lib/blob-text'
import { groupByRepo } from '../../www/src/lib/group'
import { hunks, segments } from '../../www/src/lib/highlight'
import { isPageKey, isTyping } from '../../www/src/lib/keyboard'
import { readNdjson } from '../../www/src/lib/ndjson'
import { parseRoute, routeSearch } from '../../www/src/lib/route'

describe('segments', () => {
  test('splits a line around its matches', () => {
    expect(segments('const a = useState(0)', [{ start: 10, end: 18 }])).toEqual([
      { text: 'const a = ', match: false },
      { text: 'useState', match: true },
      { text: '(0)', match: false },
    ])
  })

  test('merges overlapping ranges and clamps ranges past the end', () => {
    expect(segments('abcdef', [{ start: 3, end: 5 }, { start: 1, end: 4 }, { start: 5, end: 99 }])).toEqual([
      { text: 'a', match: false },
      { text: 'bcdef', match: true },
    ])
  })

  test('an empty line is one empty plain segment', () => {
    expect(segments('', [])).toEqual([{ text: '', match: false }])
  })
})

describe('hunks', () => {
  test('starts a new run wherever line numbers skip', () => {
    const line = (number: number): SearchLine => ({ number, text: '', context: false, ranges: [] })
    expect(hunks([line(1), line(2), line(5), line(6), line(9)]).map(run => run.map(l => l.number))).toEqual([[1, 2], [5, 6], [9]])
  })
})

describe('route', () => {
  test('round-trips every screen', () => {
    for (const route of [
      { view: 'search', q: 'a b&c' },
      { view: 'search', q: '' },
      { view: 'repos', q: 'x' },
      { view: 'file', q: 'x', repo: 'me/app', path: 'src/a b.ts', line: 12 },
      { view: 'file', q: '', repo: 'me/app', path: 'README.md' },
    ] as const) {
      expect(parseRoute(routeSearch(route))).toEqual(route)
    }
    expect(routeSearch({ view: 'search', q: '' })).toBe('')
  })

  test('anything incomplete or unknown is the search screen', () => {
    expect(parseRoute('?view=file&repo=me/app&q=x')).toEqual({ view: 'search', q: 'x' })
    expect(parseRoute('?view=nope')).toEqual({ view: 'search', q: '' })
    expect(parseRoute('?view=file&repo=a/b&path=c&line=-1')).toEqual({ view: 'file', q: '', repo: 'a/b', path: 'c' })
  })
})

describe('readNdjson', () => {
  function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
    const bytes = chunks.map(chunk => new TextEncoder().encode(chunk))
    return new ReadableStream({
      pull(controller): void {
        const next = bytes.shift()
        if (next) controller.enqueue(next)
        else controller.close()
      },
    })
  }

  test('parses lines split across chunks, including a multi-byte character, and a last line without a newline', async () => {
    const euro = new TextEncoder().encode('{"a":"€"}\n')
    const stream = new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(euro.subarray(0, 7))
        controller.enqueue(euro.subarray(7))
        controller.enqueue(new TextEncoder().encode('\n{"b":1}'))
        controller.close()
      },
    })
    expect(await Array.fromAsync(readNdjson(stream))).toEqual([{ a: '€' }, { b: 1 }])
    expect(await Array.fromAsync(readNdjson(streamOf(['{"x"', ':1}\n{"y":2}\n'])))).toEqual([{ x: 1 }, { y: 2 }])
  })

  test('stopping early cancels the stream', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller): void {
        controller.enqueue(new TextEncoder().encode('{"n":1}\n'))
      },
      cancel(): void {
        cancelled = true
      },
    })
    for await (const _ of readNdjson(stream)) break
    expect(cancelled).toBe(true)
  })
})

describe('blobLines', () => {
  test('splits text into lines, dropping the final newline and \\r', () => {
    expect(blobLines(new TextEncoder().encode('a\r\nb\n'))).toEqual(['a', 'b'])
    expect(blobLines(new TextEncoder().encode('a\n\n'))).toEqual(['a', ''])
    expect(blobLines(new Uint8Array())).toEqual([])
  })

  test('a NUL byte early on makes the file binary', () => {
    expect(blobLines(new Uint8Array([104, 0, 105]))).toBeUndefined()
    const late = new Uint8Array(9000).fill(97)
    late[8500] = 0
    expect(blobLines(late)).toHaveLength(1)
  })
})

describe('groupByRepo', () => {
  test('keeps first-seen repository order', () => {
    const items = [
      { repo: 'b', n: 1 },
      { repo: 'a', n: 2 },
      { repo: 'b', n: 3 },
    ]
    expect(groupByRepo(items)).toEqual([
      { repo: 'b', files: [items[0]!, items[2]!] },
      { repo: 'a', files: [items[1]!] },
    ])
  })
})

describe('isTyping', () => {
  const key = { altKey: false, ctrlKey: false, metaKey: false }
  test('fields and modifiers keep their keys; the page gets the rest', () => {
    expect(isTyping({ ...key, target: { tagName: 'INPUT' } as unknown as EventTarget })).toBe(true)
    expect(isTyping({ ...key, target: { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget })).toBe(true)
    expect(isTyping({ ...key, metaKey: true, target: null })).toBe(true)
    expect(isTyping({ ...key, target: { tagName: 'BODY' } as unknown as EventTarget })).toBe(false)
  })
})

describe('isPageKey', () => {
  const key = { altKey: false, ctrlKey: false, metaKey: false }
  test('only a key pressed with nothing focused is a shortcut', () => {
    expect(isPageKey({ ...key, target: { tagName: 'BODY' } as unknown as EventTarget })).toBe(true)
    expect(isPageKey({ ...key, target: null })).toBe(true)
    for (const tagName of ['A', 'BUTTON', 'SUMMARY', 'INPUT']) {
      expect(isPageKey({ ...key, target: { tagName } as unknown as EventTarget })).toBe(false)
    }
    expect(isPageKey({ ...key, ctrlKey: true, target: null })).toBe(false)
  })
})
