/**
 * Refuses API requests that did not come from the app's own window.
 *
 * @module
 */

import { timingSafeEqual } from 'node:crypto'

import type { ApiOptions } from '../desktop.types'
import { errorResponse } from './respond'

/** The header the page sends the per-run token in. */
export const TOKEN_HEADER = 'x-bundle-grep-token'

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Checks an `/api/` request before any route sees it.
 *
 * - The `Host` header must be the server's own. A page that reached the port
 *   through DNS rebinding sends its own host name, so it is turned away even
 *   though the socket is local.
 * - The token must match. It reaches the page only through the bridge, which
 *   barlo answers for the app's origin alone, so another local page cannot
 *   learn it.
 * - Only `GET` and `HEAD` are served: nothing that changes state is reachable
 *   over HTTP.
 *
 * @returns A refusal, or `undefined` when the request may proceed.
 */
export function guard(request: Request, options: Pick<ApiOptions, 'host' | 'token'>): Response | undefined {
  if (request.headers.get('host') !== options.host) {
    return errorResponse(403, { _tag: 'ForbiddenError', message: 'Unexpected Host header' })
  }
  if (!sameSecret(request.headers.get(TOKEN_HEADER) ?? '', options.token)) {
    return errorResponse(403, { _tag: 'ForbiddenError', message: 'Missing or wrong token' })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse(405, { _tag: 'MethodNotAllowedError', message: `${request.method} is not allowed` })
  }
  return undefined
}
