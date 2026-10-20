import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ArchiveLayout } from '@bundle-grep/core'

import { TOKEN_HEADER } from '../src/api/guard'
import type { AppServer } from '../src/desktop.types'
import { serveApp } from '../src/serve-app'

let root: string
let layout: ArchiveLayout
let dev: ReturnType<typeof Bun.serve>
let app: AppServer
let base: string
let token: string

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'bundle-grep-serve-'))
  layout = { archiveDir: join(root, 'archive'), cacheDir: join(root, 'cache') }
  dev = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: request => {
      const url = new URL(request.url)
      if (url.pathname === '/redirect') return Response.redirect('/elsewhere', 302)
      return Response.json({ path: `${url.pathname}${url.search}`, host: request.headers.get('host') })
    },
  })
  app = (await serveApp({ layout, root, devServer: `http://127.0.0.1:${dev.port}` })).unwrap()
  const url = new URL(app.url)
  base = url.origin
  token = url.hash.replace(/^#token=/, '')
})

afterAll(async () => {
  await app.stop()
  await dev.stop(true)
  rmSync(root, { recursive: true, force: true })
})

describe('serveApp', () => {
  test('listens on 127.0.0.1 and hands out the token in the fragment', () => {
    expect(app.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#token=[\w-]{43}$/)
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

  test('a request for another host is refused, UI included', async () => {
    for (const path of ['/', '/api/settings']) {
      const response = await fetch(`${base}${path}`, { headers: { host: 'evil.example', [TOKEN_HEADER]: token } })
      expect(response.status).toBe(403)
    }
  })

  test('a dev server that does not answer is a 502', async () => {
    const down = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() })
    const origin = `http://127.0.0.1:${down.port}`
    await down.stop(true)
    const orphan = (await serveApp({ layout, root, devServer: origin })).unwrap()
    try {
      expect((await fetch(new URL(orphan.url).origin)).status).toBe(502)
    } finally {
      await orphan.stop()
    }
  })

  test('a port in use is a ServeError', async () => {
    const taken = await serveApp({ layout, root, devServer: `http://127.0.0.1:${dev.port}`, port: Number(new URL(base).port) })
    expect(taken.isErr() && taken.error._tag).toBe('ServeError')
  })

  test.skipIf(!existsSync(join(import.meta.dir, '../www/dist/index.html')))('serves the built UI at / only', async () => {
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
    const other = (await serveApp({ layout, root, devServer: `http://127.0.0.1:${dev.port}` })).unwrap()
    await other.stop()
    await expect(fetch(new URL(other.url).origin)).rejects.toThrow()
  })
})
