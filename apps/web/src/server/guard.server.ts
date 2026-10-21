/**
 * Lets in only the browser that opened this run's link.
 *
 * @module
 */

import { timingSafeEqual } from 'node:crypto'

import type { WebConfig, WebState } from './web-config.types'

/** Compares two secrets in time that does not depend on where they differ. */
export function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * The session cookie's name, which carries the port.
 *
 * Browsers share cookies between ports of one host, so two runs on different
 * ports keep separate cookies rather than overwriting each other's.
 */
export function cookieName(config: Pick<WebConfig, 'port'>): string {
  return `bundle_grep_${config.port}`
}

function cookieValue(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}

function forbidden(message: string): Response {
  return new Response(`${message}\n`, {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Checks a request before any page or server function sees it.
 *
 * Every request but a `GET` or `HEAD` of `/session` needs the session cookie,
 * which only the browser that traded this run's code holds. It is
 * `SameSite=Strict`, so a page on another site cannot send it along, and it
 * belongs to the host name the browser traded the code on, so a page that
 * reached the port through DNS rebinding has none either. The `Host` header
 * is not checked, so `localhost` and a forwarded port work too.
 *
 * @returns A refusal, or `undefined` when the request may proceed.
 */
export function guardRequest(request: Request, config: WebConfig): Response | undefined {
  const redeeming = request.method === 'GET' || request.method === 'HEAD'
  if (redeeming && new URL(request.url).pathname === '/session') return undefined
  if (!sameSecret(cookieValue(request, cookieName(config)) ?? '', config.token)) {
    return forbidden('This browser has no session for this run; open the URL `bundle-grep ui` printed')
  }
  return undefined
}

/**
 * Answers `GET /session?code=…`: trades the one-time code for the session
 * cookie, then sends the browser to the search page.
 *
 * The URL `bundle-grep ui` opens carries a code rather than the secret, since
 * the URL is passed to the browser on its command line, printed, and kept in
 * browser history. Only the first request with the right code gets the
 * cookie; any other is a `403`.
 */
export function redeemSession(request: Request, state: WebState): Response {
  const { config } = state
  const code = new URL(request.url).searchParams.get('code') ?? ''
  if (request.method !== 'GET' || state.codeUsed || !sameSecret(code, config.code)) {
    return forbidden('This link was already used or is not this run’s; use the tab it opened, or restart `bundle-grep ui`')
  }
  state.codeUsed = true
  return new Response(null, {
    status: 303,
    headers: {
      location: '/',
      'set-cookie': `${cookieName(config)}=${config.token}; Path=/; HttpOnly; SameSite=Strict`,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  })
}
