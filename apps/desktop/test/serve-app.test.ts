import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ArchiveLayout } from '@bundle-grep/core'

import { listen, type Listening } from '../../../packages/core/test/listen'
import { TOKEN_HEADER } from '../src/api/guard'
import type { AppServer } from '../src/desktop.types'
import { serveApp } from '../src/serve-app'

let root: string
let layout: ArchiveLayout
let dev: Listening
let app: AppServer
let base: string
let code: string
let token: string

function redeem(origin: string, given: string, headers: Record<string, string> = { origin }): Promise<Response> {
  return fetch(`${origin}/api/session`, { method: 'POST', headers, body: JSON.stringify({ code: given }) })
}

/** Requests a path with headers `fetch` will not send as given, such as `Host`. */
function statusFor(path: string, headers: Record<string, string>): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base)
    get({ hostname: url.hostname, port: url.port, path: url.pathname, headers }, response => {
      response.resume()
      resolve(response.statusCode)
    }).on('error', reject)
  })
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'bundle-grep-serve-'))
  layout = { archiveDir: join(root, 'archive'), cacheDir: join(root, 'cache') }
  dev = await listen(request => {
    const url = new URL(request.url)
    if (url.pathname === '/redirect') return Response.redirect(new URL('/elsewhere', url), 302)
    return Response.json({ path: `${url.pathname}${url.search}`, host: request.headers.get('host') })
  })
  app = (await serveApp({ layout, root, devServer: dev.origin })).unwrap()
  const url = new URL(app.url)
  base = url.origin
  code = url.hash.replace(/^#code=/, '')
  token = ((await (await redeem(base, code)).json()) as { token: string }).token
})

afterAll(async () => {
  await app.stop()
  await dev.close()
  rmSync(root, { recursive: true, force: true })
})

describe('serveApp', () => {
  test('listens on 127.0.0.1 with a one-time code in the fragment', () => {
    expect(app.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#code=[\w-]{43}$/)
    expect(token).toMatch(/^[\w-]{43}$/)
    expect(token).not.toBe(code)
  })

  test('the code is traded for the token once, and only from the server\'s own origin', async () => {
    const other = (await serveApp({ layout, root, devServer: dev.origin })).unwrap()
    try {
      const origin = new URL(other.url).origin
      const fresh = new URL(other.url).hash.replace(/^#code=/, '')
      expect((await redeem(origin, fresh, {})).status).toBe(403)
      expect((await redeem(origin, fresh, { origin: 'http://evil.example' })).status).toBe(403)
      expect((await redeem(origin, `${fresh.slice(1)}x`)).status).toBe(403)
      expect((await fetch(`${origin}/api/session`)).status).toBe(403)
      const traded = await redeem(origin, fresh)
      expect(traded.status).toBe(200)
      const { token: given } = (await traded.json()) as { token: string }
      expect((await fetch(`${origin}/api/settings`, { headers: { [TOKEN_HEADER]: given } })).status).toBe(200)
      expect(await (await redeem(origin, fresh)).json()).toMatchObject({ error: { _tag: 'ForbiddenError' } })
    } finally {
      await other.stop()
    }
  })

  test('the API answers on the same origin', async () => {
    const response = await fetch(`${base}/api/settings`, { headers: { [TOKEN_HEADER]: token } })
    expect(await response.json()).toEqual({ root, archiveDir: layout.archiveDir, cacheDir: layout.cacheDir })
    expect((await fetch(`${base}/api/settings`)).status).toBe(403)
  })

  test('the UI is proxied from the dev server, to its own host', async () => {
    expect(await (await fetch(`${base}/src/main.tsx?t=1`)).json()).toEqual({
      path: '/src/main.tsx?t=1',
      host: `127.0.0.1:${dev.port}`,
    })
    const redirect = await fetch(`${base}/redirect`, { redirect: 'manual' })
    expect(redirect.status).toBe(302)
  })

  test('a request with a body is proxied too', async () => {
    const response = await fetch(`${base}/__vite_ping`, { method: 'POST', body: 'x' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ path: '/__vite_ping' })
  })

  test('a path that looks like another host stays on the dev server', async () => {
    await using outside = await listen(() => new Response('outside'))
    const response = await fetch(`${base}//127.0.0.1:${outside.port}/payload`)
    expect(await response.json()).toMatchObject({ host: `127.0.0.1:${dev.port}` })
  })

  test('a request for another host is refused, UI included', async () => {
    for (const path of ['/', '/api/settings']) {
      expect(await statusFor(path, { host: 'evil.example', [TOKEN_HEADER]: token })).toBe(403)
    }
  })

  test('a dev server that does not answer is a 502', async () => {
    const down = await listen(() => new Response())
    const origin = down.origin
    await down.close()
    const orphan = (await serveApp({ layout, root, devServer: origin })).unwrap()
    try {
      expect((await fetch(new URL(orphan.url).origin)).status).toBe(502)
    } finally {
      await orphan.stop()
    }
  })

  test('a port in use is a ServeError', async () => {
    const taken = await serveApp({ layout, root, devServer: dev.origin, port: Number(new URL(base).port) })
    expect(taken.isErr() && taken.error._tag).toBe('ServeError')
  })

  test.skipIf(!existsSync(join(import.meta.dirname, '../www/dist/index.html')))('serves the built UI at / only', async () => {
    const built = (await serveApp({ layout, root })).unwrap()
    try {
      const origin = new URL(built.url).origin
      const page = await fetch(origin)
      expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(await page.text()).toContain('<title>bundle-grep</title>')
      expect((await fetch(`${origin}/index.html`)).status).toBe(404)
      expect((await fetch(origin, { method: 'POST' })).status).toBe(405)
    } finally {
      await built.stop()
    }
  })

  test('stop closes the server', async () => {
    const other = (await serveApp({ layout, root, devServer: dev.origin })).unwrap()
    await other.stop()
    await expect(fetch(new URL(other.url).origin)).rejects.toThrow()
  })
})
