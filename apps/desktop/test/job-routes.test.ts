import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import type { ArchiveLayout } from '@bundle-grep/core'

import { createFixtureRepo, isolateGitConfig, type FixtureRepo } from '../../../packages/core/test/fixture'
import { createApi } from '../src/api/create-api'
import { TOKEN_HEADER } from '../src/api/guard'
import type { ApiHandler, ApiOptions } from '../src/desktop.types'

isolateGitConfig()

const HOST = '127.0.0.1:4100'
const TOKEN = 'secret-token'

let fixture: FixtureRepo
let layout: ArchiveLayout

beforeAll(() => {
  fixture = createFixtureRepo([{ message: 'init', files: { 'a.txt': 'hello\n' } }])
  layout = { archiveDir: join(fixture.root, 'archive'), cacheDir: join(fixture.root, 'cache') }
})

afterAll(() => fixture[Symbol.dispose]())

function apiFor(extra: Partial<ApiOptions> = {}): ApiHandler {
  return createApi({ layout, root: fixture.root, host: HOST, token: TOKEN, ...extra })
}

async function call(api: ApiHandler, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { host: HOST, origin: `http://${HOST}`, [TOKEN_HEADER]: TOKEN }
  const init: RequestInit = body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) }
  const response = await api(new Request(`http://${HOST}${path}`, init))
  if (!response) throw new Error(`${path} was declined`)
  return response
}

function post(api: ApiHandler, path: string, body: unknown = null): Promise<Response> {
  return call(api, path, body)
}

async function items(response: Response): Promise<unknown[]> {
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8')
  return (await response.text())
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as { type: string })
    .filter(item => item.type !== 'heartbeat')
}

async function json(response: Response): Promise<unknown> {
  expect(response.status).toBe(200)
  return response.json()
}

describe('archive routes', () => {
  test('settings report the layout', async () => {
    expect(await json(await call(apiFor(), '/api/settings'))).toEqual({
      root: fixture.root,
      archiveDir: layout.archiveDir,
      cacheDir: layout.cacheDir,
    })
  })

  test('languages lists what language: accepts', async () => {
    expect(await json(await call(apiFor(), '/api/languages'))).toContain('TypeScript')
  })

  test('symbol languages lists what symbol: covers', async () => {
    expect(await json(await call(apiFor(), '/api/symbol-languages'))).toContain('Go')
  })
})

describe('sync and restore', () => {
  test('sync rejects anything but a non-empty array of sources', async () => {
    const api = apiFor()
    for (const body of [null, 'x', {}, { sources: 'x' }, { sources: [] }, { sources: [''] }, { sources: [1] }, { sources: ['ok', null] }]) {
      const response = await post(api, '/api/sync', body)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { _tag: 'UsageError' } })
    }
    const malformed = await api(
      new Request(`http://${HOST}/api/sync`, {
        method: 'POST',
        headers: { host: HOST, origin: `http://${HOST}`, [TOKEN_HEADER]: TOKEN },
        body: '{',
      }),
    )
    expect(malformed?.status).toBe(400)
  })

  test('sync, list, and restore work on a local repository', async () => {
    const api = apiFor()
    const synced = await items(await post(api, '/api/sync', { sources: [fixture.repo, fixture.repo] }))
    expect(synced).toEqual([{ type: 'synced', repo: expect.any(String), status: 'created' }])
    const repo = (synced[0] as { repo: string }).repo

    expect(await json(await call(api, '/api/repos'))).toMatchObject({
      repos: [{ name: repo, state: 'ready', metadata: { defaultBranch: 'main' } }],
      invalid: [],
    })

    rmSync(join(layout.cacheDir), { recursive: true, force: true })
    expect(await json(await call(api, '/api/repos'))).toMatchObject({ repos: [{ name: repo, state: 'unrestored' }] })
    expect(await items(await post(api, '/api/restore'))).toEqual([{ type: 'restored', repo, status: 'created' }])
  })

  test('a source that cannot be resolved is a failed item, not a failed request', async () => {
    const api = apiFor({ gh: join(fixture.root, 'no-such-gh') })
    expect(await items(await post(api, '/api/sync', { sources: ['some-owner'] }))).toMatchObject([
      { type: 'failed', subject: 'some-owner', error: { _tag: 'GhError' } },
    ])
  })

  test('only one sync or restore runs at a time, until its stream is over', async () => {
    const api = apiFor()
    const first = await post(api, '/api/restore')
    const second = await post(api, '/api/sync', { sources: [fixture.repo] })
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ error: { _tag: 'BusyError' } })
    await items(first)
    expect((await items(await post(api, '/api/sync', { sources: [fixture.repo] }))).length).toBe(1)
  })

  test('cancelling a stream before reading it frees the lock', async () => {
    const api = apiFor()
    await (await post(api, '/api/restore')).body!.cancel()
    expect((await post(api, '/api/restore')).status).toBe(200)
  })

  test('a stopped server stops the work', async () => {
    await items(await post(apiFor(), '/api/sync', { sources: [fixture.repo] }))
    expect(await items(await post(apiFor(), '/api/restore'))).toHaveLength(1)
    const stopped = new AbortController()
    stopped.abort()
    expect(await items(await post(apiFor({ signal: stopped.signal }), '/api/restore'))).toEqual([])
  })

  test('errors keep only their tag and message', async () => {
    const synced = await items(await post(apiFor(), '/api/sync', { sources: ['/no/such/repo'] }))
    expect(synced).toMatchObject([{ type: 'failed', error: { _tag: 'GitError' } }])
    expect(Object.keys((synced[0] as { error: object }).error).sort()).toEqual(['_tag', 'message'])
  })
})
