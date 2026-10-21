import { describe, expect, test } from 'vitest'

import { cookieName, guardRequest, redeemSession, sameSecret } from '../src/server/guard.server'
import type { WebConfig, WebState } from '../src/server/web-config.types'

const HOST = '127.0.0.1:4100'
const config: WebConfig = {
  layout: { archiveDir: '/a', cacheDir: '/c' },
  root: '/',
  host: HOST,
  code: 'one-time-code',
  token: 'session-secret',
}

function request(path: string, headers: Record<string, string> = {}, method = 'GET'): Request {
  return new Request(`http://${HOST}${path}`, { method, headers: { host: HOST, ...headers } })
}

const withCookie = { cookie: `other=1; ${cookieName(config)}=${config.token}` }

describe('guardRequest', () => {
  test('lets in the browser holding this run’s cookie', () => {
    expect(cookieName(config)).toBe('bundle_grep_4100')
    expect(guardRequest(request('/', withCookie), config)).toBeUndefined()
    expect(guardRequest(request('/_serverFn/x', withCookie), config)).toBeUndefined()
  })

  test('refuses another Host header, as a DNS-rebound page sends', () => {
    for (const host of ['evil.example:4100', '127.0.0.1:4101', 'localhost:4100']) {
      expect(guardRequest(request('/', { ...withCookie, host }), config)?.status).toBe(403)
    }
    expect(guardRequest(request('/session', { host: 'evil.example:4100' }), config)?.status).toBe(403)
  })

  test('refuses a missing, wrong, or other run’s cookie', async () => {
    const refused = guardRequest(request('/'), config)
    expect(refused?.status).toBe(403)
    expect(await refused?.text()).toContain('bundle-grep ui')
    expect(guardRequest(request('/', { cookie: `${cookieName(config)}=session-secreu` }), config)?.status).toBe(403)
    expect(guardRequest(request('/', { cookie: `bundle_grep_4101=${config.token}` }), config)?.status).toBe(403)
  })

  test('lets /session through to trade its code', () => {
    expect(guardRequest(request('/session?code=x'), config)).toBeUndefined()
  })
})

describe('redeemSession', () => {
  test('trades the code once for an HttpOnly, SameSite=Strict cookie, then sends the browser home', () => {
    const state: WebState = { config, codeUsed: false, busy: false }
    const redeemed = redeemSession(request(`/session?code=${config.code}`), state)
    expect(redeemed.status).toBe(303)
    expect(redeemed.headers.get('location')).toBe('/')
    expect(redeemed.headers.get('set-cookie')).toBe('bundle_grep_4100=session-secret; Path=/; HttpOnly; SameSite=Strict')
    expect(redeemSession(request(`/session?code=${config.code}`), state).status).toBe(403)
  })

  test('refuses a wrong code or method without using up the code', () => {
    const state: WebState = { config, codeUsed: false, busy: false }
    expect(redeemSession(request('/session?code=nope'), state).status).toBe(403)
    expect(redeemSession(request('/session'), state).status).toBe(403)
    expect(redeemSession(request(`/session?code=${config.code}`, {}, 'POST'), state).status).toBe(403)
    expect(state.codeUsed).toBe(false)
  })

  test('compares secrets of any length', () => {
    expect(sameSecret('a', 'a')).toBe(true)
    expect(sameSecret('a', 'ab')).toBe(false)
    expect(sameSecret('', 'a')).toBe(false)
  })
})
