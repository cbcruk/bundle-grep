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
export function cookieName(config: Pick<WebConfig, 'host'>): string {
  return `bundle_grep_${config.host.split(':').at(-1)}`
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
 * - The `Host` header must be the server's own. A page that reached the port
 *   through DNS rebinding sends its own host name, so it is turned away even
 *   though the socket is local.
 * - Every path but `/session` needs the session cookie, which only the
 *   browser that traded this run's code holds. It is `SameSite=Strict`, so a
 *   page on another site cannot send it along.
 *
 * @returns A refusal, or `undefined` when the request may proceed.
 */
export function guardRequest(request: Request, config: WebConfig): Response | undefined {
  if (request.headers.get('host') !== config.host) return forbidden('Unexpected Host header')
  if (new URL(request.url).pathname === '/session') return undefined
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
