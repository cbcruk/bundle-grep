import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { syncRepos, type ArchiveLayout } from '@bundle-grep/core'

import { createFixtureRepo, isolateGitConfig, type FixtureRepo } from '../../../packages/core/test/fixture'
import type { SearchInput } from '../src/api/api.types'
import { archiveIndex, listRepos, settingsOf } from '../src/server/archive.server'
import { readFileContent } from '../src/server/blob.server'
import { iteratorStream } from '../src/server/iterator-stream'
import { startRestore, startSync } from '../src/server/jobs.server'
import { parseBlobInput, parseSearchInput, parseSyncInput } from '../src/server/search-input'
import { searchStream } from '../src/server/search.server'
import type { WebConfig, WebState } from '../src/server/web-config.types'

isolateGitConfig()

let fixture: FixtureRepo
let layout: ArchiveLayout

beforeAll(async () => {
  fixture = createFixtureRepo([
    {
      message: 'init',
      files: {
        'src/counter.ts': 'import { useState } from "react"\n\nexport const n = useState(0)\n',
        'README.md': '# Counter\n',
        'bin/blob': '\u0000\u0001',
      },
    },
  ])
  layout = { archiveDir: join(fixture.root, 'archive'), cacheDir: join(fixture.root, 'cache') }
  for await (const event of syncRepos([{ owner: 'me', name: 'app', url: fixture.repo }], layout)) {
    if (event.type === 'failed') throw new Error(event.error.message)
  }
})

afterAll(() => fixture[Symbol.dispose]())

function search(q: string, extra: Partial<SearchInput> = {}): Promise<unknown[]> {
  return Array.fromAsync(searchStream({ q, limit: 100, context: 0, ...extra }, layout))
}

function stateFor(extra: Partial<WebConfig> = {}): WebState {
  return { config: { layout, root: fixture.root, port: 4100, code: 'c', token: 't', ...extra }, codeUsed: false, busy: false }
}

describe('searchStream', () => {
  test('streams the archive summary, files, and done', async () => {
    const events = await search('useState')
    expect(events[0]).toEqual({ type: 'archive', repos: 1, unrestored: [], invalid: [] })
    expect(events[1]).toMatchObject({ type: 'file', repo: 'me/app', path: 'src/counter.ts', lines: [{ number: 1 }, { number: 3 }] })
    expect(events.at(-1)).toMatchObject({ type: 'done', totalFiles: 1, truncated: false })
  })

  test('history: streams commits, and the file reads at the commit', async () => {
    const events = await search('history:useState')
    const commit = events.find(event => (event as { type: string }).type === 'commit') as { commit: { sha: string } }
    expect(commit).toMatchObject({ repo: 'me/app', commit: { sha: fixture.git('rev-parse', 'HEAD') } })
    const file = await readFileContent({ repo: 'me/app', path: 'src/counter.ts', ref: commit.commit.sha }, layout)
    expect(file).toMatchObject({ ok: true, value: { kind: 'text', lines: ['import { useState } from "react"', '', 'export const n = useState(0)'] } })
  })

  test('passes limit and context on', async () => {
    const limited = await search('e', { limit: 1 })
    expect(limited.filter(event => (event as { type: string }).type === 'file')).toHaveLength(1)
    expect(limited.at(-1)).toMatchObject({ truncated: true })
    const context = await search('content:useState', { context: 1 })
    expect(context[1]).toMatchObject({ lines: [{ number: 1 }, { number: 2, context: true }, { number: 3 }] })
  })

  test('a rejected query is a lone error event with its span', async () => {
    expect(await search('a (b')).toEqual([{ type: 'error', error: { _tag: 'QueryParseError', message: expect.any(String), span: { offset: 2, length: 1 } } }])
    expect(await search('x language:nope')).toMatchObject([{ type: 'error', error: { _tag: 'QueryCompileError' } }])
    expect(await search('x /[a/')).toMatchObject([{ type: 'error', error: { _tag: 'QueryCompileError', span: { offset: 2, length: 4 } } }])
  })

  test('cancelling the stream stops the search', async () => {
    const reader = searchStream({ q: 'useState', limit: 100, context: 0 }, layout).getReader()
    expect((await reader.read()).value).toMatchObject({ type: 'archive' })
    await reader.cancel()
    expect((await reader.closed.then(() => 'closed'))).toBe('closed')
  })

  test('an aborted signal stops the search before it reads a repository', async () => {
    const stopped = new AbortController()
    stopped.abort()
    const events = await Array.fromAsync(searchStream({ q: 'useState', limit: 100, context: 0 }, layout, stopped.signal))
    expect(events.some(event => event.type === 'file')).toBe(false)
  })
})

describe('readFileContent', () => {
  test('reads text as lines, and binary as its size', async () => {
    expect(await readFileContent({ repo: 'me/app', path: 'README.md' }, layout)).toEqual({ ok: true, value: { kind: 'text', lines: ['# Counter'] } })
    expect(await readFileContent({ repo: 'me/app', path: 'bin/blob' }, layout)).toEqual({ ok: true, value: { kind: 'binary', size: 2 } })
  })

  test('a missing file, directory, commit, or repository is an error', async () => {
    expect(await readFileContent({ repo: 'me/app', path: 'nope.txt' }, layout)).toMatchObject({ ok: false, error: { _tag: 'BlobNotFoundError' } })
    expect(await readFileContent({ repo: 'me/app', path: 'src' }, layout)).toMatchObject({ ok: false, error: { _tag: 'BlobNotFoundError' } })
    expect(await readFileContent({ repo: 'me/app', path: 'README.md', ref: 'f'.repeat(40) }, layout)).toMatchObject({
      ok: false,
      error: { _tag: 'BlobNotFoundError' },
    })
    expect(await readFileContent({ repo: 'me/other', path: 'README.md' }, layout)).toMatchObject({ ok: false, error: { _tag: 'NotFoundError' } })
  })

  test('refuses paths that leave the repository', async () => {
    for (const input of [
      { repo: 'me/app', path: '' },
      { repo: 'me/app', path: 'src/../README.md' },
      { repo: 'me/app', path: './README.md' },
      { repo: 'me/app', path: 'src//counter.ts' },
      { repo: 'me/app', path: 'README.md\0' },
      { repo: 'me/app/x', path: 'README.md' },
      { repo: 'me', path: 'README.md' },
      { repo: '../me/app', path: 'README.md' },
    ]) {
      expect({ input, result: await readFileContent(input, layout) }).toMatchObject({ input, result: { ok: false } })
    }
  })
})

describe('archive', () => {
  test('lists repositories, languages, and settings', async () => {
    const index = await archiveIndex(layout)
    expect(index.repos).toMatchObject({ ok: true, value: { repos: [{ name: 'me/app', state: 'ready' }], invalid: [] } })
    expect(index.languages).toContain('TypeScript')
    expect(index.symbolLanguages).toContain('Go')
    expect(settingsOf({ layout, root: fixture.root })).toEqual({ root: fixture.root, ...layout })
  })
})

describe('input validation', () => {
  test('a search needs a query and whole numbers in range', () => {
    expect(parseSearchInput({ q: 'x', limit: 1000, context: 20 })).toEqual({ q: 'x', limit: 1000, context: 20 })
    for (const input of [null, {}, { q: 1, limit: 1, context: 0 }, { q: 'x', limit: 1001, context: 0 }, { q: 'x', limit: 1, context: 21 },
      { q: 'x', limit: -1, context: 0 }, { q: 'x', limit: 1.5, context: 0 }, { q: 'x'.repeat(4097), limit: 1, context: 0 }]) {
      expect(() => parseSearchInput(input)).toThrow(TypeError)
    }
  })

  test('a file needs strings and a full commit id, if any', () => {
    expect(parseBlobInput({ repo: 'a/b', path: 'c' })).toEqual({ repo: 'a/b', path: 'c' })
    expect(parseBlobInput({ repo: 'a/b', path: 'c', ref: 'a'.repeat(40) })).toEqual({ repo: 'a/b', path: 'c', ref: 'a'.repeat(40) })
    for (const ref of ['HEAD', '-p', 'main', 'a'.repeat(39)]) expect(() => parseBlobInput({ repo: 'a/b', path: 'c', ref })).toThrow(TypeError)
  })

  test('a sync needs a non-empty array of sources', () => {
    expect(parseSyncInput({ sources: ['a'] })).toEqual({ sources: ['a'] })
    for (const input of [null, 'x', {}, { sources: 'x' }, { sources: [] }, { sources: [''] }, { sources: [1] }, { sources: ['ok', null] }]) {
      expect(() => parseSyncInput(input)).toThrow(TypeError)
    }
  })
})

describe('iteratorStream', () => {
  test('runs onClose once, even when cancelled before the first pull', async () => {
    const onClose = vi.fn()
    const onCancel = vi.fn()
    async function* never(): AsyncGenerator<number, void> {
      yield 1
    }
    await iteratorStream(never(), { onCancel, onClose }).cancel()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('errors the stream with what the iterator throws, and still closes', async () => {
    const onClose = vi.fn()
    async function* failing(): AsyncGenerator<number, void> {
      yield 1
      throw new Error('boom')
    }
    const reader = iteratorStream(failing(), { onClose }).getReader()
    expect((await reader.read()).value).toBe(1)
    await expect(reader.read()).rejects.toThrow('boom')
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('sync and restore', () => {
  test('sync, list, and restore work on a local repository', async () => {
    const state = stateFor()
    const started = startSync(state, [fixture.repo, fixture.repo])
    if (!started.ok) throw new Error(started.error.message)
    const synced = await Array.fromAsync(started.value)
    expect(synced).toEqual([{ type: 'synced', repo: expect.any(String), status: expect.any(String) }])
    expect(state.busy).toBe(false)
    const repo = (synced[0] as { repo: string }).repo

    rmSync(layout.cacheDir, { recursive: true, force: true })
    const listed = await listRepos(layout)
    expect(listed.ok && listed.value.repos.find(row => row.name === repo)).toMatchObject({ state: 'unrestored' })
    const restore = await startRestore(state)
    if (!restore.ok) throw new Error(restore.error.message)
    expect(await Array.fromAsync(restore.value)).toEqual(expect.arrayContaining([{ type: 'restored', repo, status: 'created' }]))
  })

  test('a source that cannot be resolved is a failed item', async () => {
    const started = startSync(stateFor({ gh: join(fixture.root, 'no-such-gh') }), ['some-owner'])
    if (!started.ok) throw new Error(started.error.message)
    expect(await Array.fromAsync(started.value)).toMatchObject([{ type: 'failed', subject: 'some-owner', error: { _tag: 'GhError' } }])
  })

  test('only one runs at a time, until its stream is over', async () => {
    const state = stateFor()
    const first = await startRestore(state)
    expect(startSync(state, [fixture.repo])).toMatchObject({ ok: false, error: { _tag: 'BusyError' } })
    if (!first.ok) throw new Error(first.error.message)
    await Array.fromAsync(first.value)
    expect(startSync(state, [fixture.repo]).ok).toBe(true)
  })

  test('cancelling a stream before reading it frees the lock', async () => {
    const state = stateFor()
    const first = await startRestore(state)
    if (!first.ok) throw new Error(first.error.message)
    await first.value.cancel()
    expect(state.busy).toBe(false)
  })

  test('a stopped server stops the work', async () => {
    const stopped = new AbortController()
    stopped.abort()
    const started = await startRestore(stateFor({ signal: stopped.signal }))
    if (!started.ok) throw new Error(started.error.message)
    expect(await Array.fromAsync(started.value)).toEqual([])
  })

  test('errors keep only their tag and message', async () => {
    const started = startSync(stateFor(), ['/no/such/repo'])
    if (!started.ok) throw new Error(started.error.message)
    const items = await Array.fromAsync(started.value)
    expect(items).toMatchObject([{ type: 'failed', error: { _tag: 'GitError' } }])
    expect(Object.keys((items[0] as { error: object }).error).sort()).toEqual(['_tag', 'message'])
  })
})
