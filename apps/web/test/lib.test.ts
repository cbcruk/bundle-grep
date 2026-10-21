import { describe, expect, test } from 'vitest'

import type { ChangedLine, SearchLine } from '@bundle-grep/core'

import type { CommitResult, FileResult } from '../src/hooks/use-search.types'

import { blobLines } from '../src/lib/blob-text'
import { groupByRepo } from '../src/lib/group'
import { hunks, segments } from '../src/lib/highlight'
import { isPageKey, isTyping } from '../src/lib/keyboard'
import { fileRouteOf, parseSearchString, routeHref, stringifySearchObject, validateFileSearch, validateQuerySearch } from '../src/lib/route'
import { changeRoute, commitRoute, fileRoute, routeHighlights } from '../src/lib/result-route'
import { usesHistory, usesSymbol } from '../src/components/results/results.utils'

describe('usesSymbol', () => {
  test('finds a positive symbol: qualifier anywhere in a query that parses', () => {
    expect(usesSymbol('symbol:foo')).toBe(true)
    expect(usesSymbol('a OR (b NOT -symbol:/x/)')).toBe(true)
    expect(usesSymbol('a -symbol:x')).toBe(false)
    expect(usesSymbol('symbol')).toBe(false)
    expect(usesSymbol('symbol:foo (')).toBe(false)
  })
})

describe('usesHistory', () => {
  test('finds a history: qualifier that is not negated', () => {
    expect(usesHistory('history:foo path:src')).toBe(true)
    expect(usesHistory('-history:foo')).toBe(false)
    expect(usesHistory('foo')).toBe(false)
  })
})

describe('result routes', () => {
  const commit = { sha: 'c'.repeat(40), parent: 'p'.repeat(40), date: '2026-01-01T00:00:00Z', author: 'Me', subject: 's' }
  const added: ChangedLine = { change: 'added', number: 3, text: 'new', ranges: [{ start: 0, end: 3 }] }
  const removed: ChangedLine = { change: 'removed', number: 5, text: 'old', ranges: [{ start: 0, end: 1 }] }
  const result: CommitResult = { type: 'commit', repo: 'me/app', commit, files: [{ path: 'a.ts', lines: [removed, added] }] }

  test('a file opens at its first match, at the ref: commit it was found in', () => {
    const lines = [{ number: 1, text: '', context: true, ranges: [] }, { number: 2, text: 'x', context: false, ranges: [] }]
    expect(fileRoute({ q: 'q' }, { type: 'file', repo: 'me/app', path: 'a.ts', lines })).toEqual({ view: 'file', q: 'q', repo: 'me/app', path: 'a.ts', line: 2 })
    expect(fileRoute({ q: 'q' }, { type: 'file', repo: 'me/app', path: 'a.ts', lines, commit: commit.sha }, 7)).toMatchObject({ ref: commit.sha, line: 7 })
  })

  test('an added line opens at the commit and a removed one at its parent', () => {
    expect(changeRoute({ q: 'q' }, 'me/app', commit, 'a.ts', added)).toMatchObject({ ref: commit.sha, line: 3 })
    expect(changeRoute({ q: 'q' }, 'me/app', commit, 'a.ts', removed)).toMatchObject({ ref: commit.parent, line: 5 })
    expect(changeRoute({ q: 'q' }, 'me/app', { ...commit, parent: null }, 'a.ts', removed)).not.toHaveProperty('line')
    expect(commitRoute({ q: 'q' }, result)).toMatchObject({ path: 'a.ts', ref: commit.parent, line: 5 })
    expect(commitRoute({ q: 'q' }, { ...result, files: [] })).toBeUndefined()
    expect(fileRoute({ q: 'q', more: true }, { type: 'file', repo: 'me/app', path: 'a.ts', lines: [] })).toMatchObject({ q: 'q', more: true })
    expect(changeRoute({ q: 'q', more: true }, 'me/app', commit, 'a.ts', added)).toMatchObject({ more: true })
  })

  test('the file view highlights the side of each change it shows', () => {
    const route = { view: 'file', q: 'q', repo: 'me/app', path: 'a.ts' } as const
    expect([...routeHighlights({ ...route, ref: commit.sha }, [], [result])]).toEqual([[3, added.ranges]])
    expect([...routeHighlights({ ...route, ref: commit.parent }, [], [result])]).toEqual([[5, removed.ranges]])
    expect([...routeHighlights({ ...route, path: 'b.ts', ref: commit.sha }, [], [result])]).toEqual([])
    const file: FileResult = { type: 'file', repo: 'me/app', path: 'a.ts', lines: [{ number: 2, text: 'x', context: false, ranges: [{ start: 0, end: 1 }] }] }
    expect([...routeHighlights(route, [file], [])]).toEqual([[2, [{ start: 0, end: 1 }]]])
    expect([...routeHighlights({ ...route, ref: commit.sha }, [file], [])]).toEqual([])
  })
})

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
  const COMMIT = 'a'.repeat(40)

  test('writes each screen as an address', () => {
    expect(routeHref({ view: 'search', q: '' })).toBe('/')
    expect(routeHref({ view: 'search', q: 'a b&c' })).toBe('/?q=a+b%26c')
    expect(routeHref({ view: 'search', q: 'x', more: true })).toBe('/?q=x&more=true')
    expect(routeHref({ view: 'repos', q: '' })).toBe('/repos')
    expect(routeHref({ view: 'repos', q: 'x' })).toBe('/repos?q=x')
    expect(routeHref({ view: 'file', q: 'x', repo: 'me/app', path: 'src/a b#?.ts', line: 12 })).toBe(
      '/file/me/app/src/a%20b%23%3F.ts?q=x&line=12',
    )
    expect(routeHref({ view: 'file', q: 'h', more: true, repo: 'me/app', path: 'a.ts', ref: COMMIT, line: 3 })).toBe(
      `/file/me/app/a.ts?q=h&more=true&ref=${COMMIT}&line=3`,
    )
  })

  test('reads search parameters back as the screen wrote them', () => {
    for (const route of [
      { view: 'search', q: '"exact" 123' },
      { view: 'search', q: 'x', more: true },
      { view: 'file', q: 'x', repo: 'me/app', path: 'src/a.ts', line: 12 },
      { view: 'file', q: '', repo: 'me/app', path: 'README.md' },
      { view: 'file', q: 'history:x', more: true, repo: 'me/app', path: 'a.ts', ref: COMMIT, line: 3 },
    ] as const) {
      const url = new URL(routeHref(route), 'http://localhost')
      const raw = parseSearchString(url.search)
      const search = { ...validateQuerySearch(raw), ...validateFileSearch(raw) }
      if (route.view === 'search') {
        expect(search).toEqual('more' in route ? { q: route.q, more: true } : { q: route.q })
        continue
      }
      const [owner, repo, ...rest] = url.pathname.split('/').slice(2).map(decodeURIComponent)
      expect(fileRouteOf({ owner: owner!, repo: repo!, _splat: rest.join('/') }, search)).toEqual(route)
    }
  })

  test('drops what a screen cannot show', () => {
    expect(validateQuerySearch({})).toEqual({ q: '' })
    expect(validateQuerySearch({ q: 'x', more: 'yes' })).toEqual({ q: 'x' })
    expect(validateFileSearch({ line: '-1', ref: 'main' })).toEqual({})
    expect(validateFileSearch({ line: '1.5', ref: 'A'.repeat(40) })).toEqual({})
    expect(validateFileSearch({ line: '7', ref: 'b'.repeat(64) })).toEqual({ line: 7, ref: 'b'.repeat(64) })
  })

  test('keeps search parameters as plain strings', () => {
    expect(parseSearchString('?q=123&more=true&q2=%22a%22')).toEqual({ q: '123', more: 'true', q2: '"a"' })
    expect(stringifySearchObject({ q: '', more: undefined, line: 3 })).toBe('?line=3')
    expect(stringifySearchObject({})).toBe('')
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
