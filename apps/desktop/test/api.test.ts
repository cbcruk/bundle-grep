import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { syncRepos, type ArchiveLayout } from '@bundle-grep/core'

import { createFixtureRepo, isolateGitConfig, type FixtureRepo } from '../../../packages/core/test/fixture'
import { createApi } from '../src/api/create-api'
import { TOKEN_HEADER } from '../src/api/guard'

isolateGitConfig()

const HOST = '127.0.0.1:4100'
const TOKEN = 'secret-token'

let fixture: FixtureRepo
let layout: ArchiveLayout

beforeAll(async () => {
  fixture = createFixtureRepo([
    {
      message: 'init',
      files: {
        'src/counter.ts': 'import { useState } from "react"\n\nexport const n = useState(0)\n',
        'README.md': '# Counter\n',
        'site/page.html': '<script>alert(1)</script>\n',
      },
    },
  ])
  layout = { archiveDir: join(fixture.root, 'archive'), cacheDir: join(fixture.root, 'cache') }
  for await (const event of syncRepos([{ owner: 'me', name: 'app', url: fixture.repo }], layout)) {
    if (event.type === 'failed') throw new Error(event.error.message)
  }
})

afterAll(() => fixture[Symbol.dispose]())

function call(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
  heartbeatMs?: number,
): Promise<Response | undefined> {
  const api = createApi({ layout, root: fixture.root, host: HOST, token: TOKEN, heartbeatMs })
  const headers = { host: HOST, [TOKEN_HEADER]: TOKEN, ...init.headers }
  return Promise.resolve(api(new Request(`http://${HOST}${path}`, { ...init, headers })))
}

async function errorOf(response: Response | undefined): Promise<{ status: number; _tag: string; span?: unknown }> {
  if (!response) throw new Error('expected a response')
  const { error } = (await response.json()) as { error: { _tag: string; span?: unknown } }
  return { status: response.status, _tag: error._tag, ...(error.span ? { span: error.span } : {}) }
}

async function lines(response: Response | undefined): Promise<Record<string, unknown>[]> {
  if (!response?.ok) throw new Error(`expected a stream, got ${response?.status}`)
  return (await response.text())
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>)
}

describe('dispatch and guard', () => {
  test('paths outside /api/ fall through to the UI', async () => {
    expect(await call('/index.html')).toBeUndefined()
    expect(await call('/apix')).toBeUndefined()
  })

  test('another Host header is refused, as a DNS-rebound page sends', async () => {
    expect(await errorOf(await call('/api/search?q=x', { headers: { host: 'evil.example:4100' } }))).toMatchObject({ status: 403 })
    expect(await errorOf(await call('/api/search?q=x', { headers: { host: '127.0.0.1:4101' } }))).toMatchObject({ status: 403 })
    expect(await errorOf(await call('/api/search?q=x', { headers: { host: 'localhost:4100' } }))).toMatchObject({ status: 403 })
  })

  test('a missing or wrong token is refused', async () => {
    expect(await errorOf(await call('/api/search?q=x', { headers: { [TOKEN_HEADER]: '' } }))).toMatchObject({ status: 403 })
    expect(await errorOf(await call('/api/search?q=x', { headers: { [TOKEN_HEADER]: 'secret-tokem' } }))).toMatchObject({ status: 403 })
    expect(await errorOf(await call('/api/search?q=x', { headers: { [TOKEN_HEADER]: 'x' } }))).toMatchObject({ status: 403 })
  })

  test('the guard runs before an unknown path is reported', async () => {
    expect(await errorOf(await call('/api/nope', { headers: { [TOKEN_HEADER]: '' } }))).toMatchObject({ status: 403 })
    expect(await errorOf(await call('/api/nope'))).toEqual({ status: 404, _tag: 'NotFoundError' })
  })

  test('a route answers its own method only', async () => {
    const origin = { origin: `http://${HOST}` }
    expect(await errorOf(await call('/api/search?q=x', { method: 'POST', body: '{}', headers: origin }))).toMatchObject({ status: 405 })
    expect(await errorOf(await call('/api/search?q=x', { method: 'DELETE', headers: origin }))).toMatchObject({ status: 405 })
    expect(await errorOf(await call('/api/sync'))).toMatchObject({ status: 405 })
    expect((await call('/api/repos', { method: 'HEAD' }))?.status).toBe(200)
  })

  test('a request that is not a GET must come from the server\'s own origin', async () => {
    const restore = (headers: Record<string, string>): Promise<Response | undefined> =>
      call('/api/restore', { method: 'POST', headers })
    expect(await errorOf(await restore({}))).toMatchObject({ status: 403 })
    expect(await errorOf(await restore({ origin: 'http://evil.example' }))).toMatchObject({ status: 403 })
    expect(await errorOf(await restore({ origin: 'http://127.0.0.1:4101' }))).toMatchObject({ status: 403 })
  })

  test('an inherited property is not a route', async () => {
    expect(await errorOf(await call('/api/constructor'))).toEqual({ status: 404, _tag: 'NotFoundError' })
  })
})

describe('/api/search', () => {
  test('streams the archive summary, files, and done as NDJSON', async () => {
    const response = await call('/api/search?q=useState')
    expect(response?.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8')
    const events = await lines(response)
    expect(events[0]).toEqual({ type: 'archive', repos: 1, unrestored: [], invalid: [] })
    expect(events[1]).toMatchObject({
      type: 'file',
      repo: 'me/app',
      path: 'src/counter.ts',
      lines: [{ number: 1, text: 'import { useState } from "react"' }, { number: 3 }],
    })
    expect(events.at(-1)).toMatchObject({ type: 'done', totalFiles: 1, truncated: false })
  })

  test('symbol: streams definitions with the name highlighted', async () => {
    const events = await lines(await call('/api/search?q=symbol:n'))
    expect(events.filter(event => event.type === 'file')).toEqual([
      {
        type: 'file',
        repo: 'me/app',
        path: 'src/counter.ts',
        language: 'TypeScript',
        lines: [{ number: 3, text: 'export const n = useState(0)', context: false, column: 13, ranges: [{ start: 13, end: 14 }] }],
      },
    ])
  })

  test('history: streams commit events, and the blob route serves a file at the commit', async () => {
    const events = await lines(await call('/api/search?q=history:useState'))
    const commit = events.find(event => event.type === 'commit') as { commit: { sha: string; parent: null }; files: { path: string }[] }
    expect(commit).toMatchObject({ repo: 'me/app', commit: { sha: fixture.git('rev-parse', 'HEAD'), parent: null }, files: [{ path: 'src/counter.ts' }] })
    expect(events.at(-1)).toMatchObject({ type: 'done', totalCommits: 1 })
    expect(await (await call(`/api/blob/me/app/${commit.commit.sha}/src/counter.ts`))?.text()).toStartWith('import')
  })

  test('limit and context are passed on', async () => {
    const limited = await lines(await call('/api/search?q=e&limit=1'))
    expect(limited.filter(event => event.type === 'file')).toHaveLength(1)
    expect(limited.at(-1)).toMatchObject({ truncated: true })

    const context = await lines(await call('/api/search?q=content:useState&context=1'))
    expect(context[1]).toMatchObject({ lines: [{ number: 1 }, { number: 2, context: true }, { number: 3 }] })
  })

  test('bad parameters are a 400', async () => {
    expect(await errorOf(await call('/api/search'))).toEqual({ status: 400, _tag: 'UsageError' })
    expect(await errorOf(await call('/api/search?q=%20'))).toEqual({ status: 400, _tag: 'UsageError' })
    expect(await errorOf(await call('/api/search?q=x&limit=-1'))).toEqual({ status: 400, _tag: 'UsageError' })
    expect(await errorOf(await call('/api/search?q=x&context=ten'))).toEqual({ status: 400, _tag: 'UsageError' })
    expect(await errorOf(await call('/api/search?q=x&limit=1001'))).toEqual({ status: 400, _tag: 'UsageError' })
    expect(await errorOf(await call('/api/search?q=x&context=21'))).toEqual({ status: 400, _tag: 'UsageError' })
    expect((await call('/api/search?q=x&limit=1000&context=20'))?.status).toBe(200)
  })

  test('query errors carry their span', async () => {
    expect(await errorOf(await call(`/api/search?q=${encodeURIComponent('a (b')}`))).toEqual({
      status: 400,
      _tag: 'QueryParseError',
      span: { offset: 2, length: 1 },
    })
    expect(await errorOf(await call(`/api/search?q=${encodeURIComponent('x language:nope')}`))).toMatchObject({
      status: 400,
      _tag: 'QueryCompileError',
    })
    expect(await errorOf(await call(`/api/search?q=${encodeURIComponent('x /[a/')}`))).toEqual({
      status: 400,
      _tag: 'QueryCompileError',
      span: { offset: 2, length: 4 },
    })
  })

  test('a quiet stream sends heartbeats, and still delivers every event', async () => {
    const events = await lines(await call('/api/search?q=useState', {}, 0))
    expect(events.some(event => event.type === 'heartbeat')).toBe(true)
    const real = events.filter(event => event.type !== 'heartbeat')
    expect(real.map(event => event.type)).toEqual(['archive', 'file', 'done'])
  })

  test('cancelling the body ends the search', async () => {
    const response = await call('/api/search?q=useState')
    const reader = response!.body!.getReader()
    expect((await reader.read()).done).toBe(false)
    await reader.cancel()
  })

  test('a client that disconnects aborts the request signal, which stops the search', async () => {
    let seen: Request | undefined
    using server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: async request => {
        seen = request
        const api = createApi({ layout, root: fixture.root, host: `127.0.0.1:${server.port}`, token: TOKEN })
        return (await api(request)) ?? new Response('Not found', { status: 404 })
      },
    })
    const client = new AbortController()
    const response = await fetch(`http://127.0.0.1:${server.port}/api/search?q=useState`, {
      headers: { [TOKEN_HEADER]: TOKEN },
      signal: client.signal,
    })
    expect(response.status).toBe(200)
    await response.body!.getReader().read()
    client.abort()

    const aborted = await Promise.race([
      new Promise<boolean>(resolve => {
        if (seen?.signal.aborted) resolve(true)
        seen?.signal.addEventListener('abort', () => resolve(true), { once: true })
      }),
      Bun.sleep(3000).then(() => false),
    ])
    expect(aborted).toBe(true)
  })
})

describe('/api/blob', () => {
  test('serves a file as inert bytes', async () => {
    const response = await call('/api/blob/me/app/HEAD/site/page.html')
    expect(response?.status).toBe(200)
    expect(await response?.text()).toBe('<script>alert(1)</script>\n')
    expect(Object.fromEntries(response!.headers)).toMatchObject({
      'content-type': 'application/octet-stream',
      'content-security-policy': 'sandbox',
      'x-content-type-options': 'nosniff',
    })
  })

  test('percent-encoded segments are decoded', async () => {
    expect(await (await call('/api/blob/me/app/HEAD/src%2Fcounter.ts'))?.text()).toStartWith('import')
  })

  test('a missing file, a directory, an unknown ref, or an unknown repository is a 404', async () => {
    expect(await errorOf(await call('/api/blob/me/app/HEAD/nope.txt'))).toEqual({ status: 404, _tag: 'BlobNotFoundError' })
    expect(await errorOf(await call('/api/blob/me/app/HEAD/src'))).toEqual({ status: 404, _tag: 'BlobNotFoundError' })
    expect(await errorOf(await call('/api/blob/me/app/nope/README.md'))).toEqual({ status: 404, _tag: 'GitError' })
    expect(await errorOf(await call('/api/blob/me/other/HEAD/README.md'))).toEqual({ status: 404, _tag: 'NotFoundError' })
  })

  test('malformed requests are a 400', async () => {
    for (const path of [
      '/api/blob/me/app/HEAD',
      '/api/blob/me/app/HEAD/',
      '/api/blob/me/app/-p/README.md',
      '/api/blob/me/app/HEAD~1/README.md',
      '/api/blob/me/app/HEAD:src/counter.ts',
      '/api/blob/me/app/HEAD/src%2F..%2FREADME.md',
      '/api/blob/me/app/HEAD/%ZZ',
      '/api/blob/me/app/HEAD/README.md%00',
      '/api/blob/me%00/app/HEAD/README.md',
      '/api/blob/me%2Fx/app/HEAD/README.md',
    ]) {
      expect({ path, ...(await errorOf(await call(path))) }).toMatchObject({ path, status: 400 })
    }
  })
})
