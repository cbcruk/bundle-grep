/**
 * Refuses API requests that did not come from the app's own page.
 *
 * @module
 */

import { timingSafeEqual } from 'node:crypto'

import type { ApiOptions } from '../desktop.types'
import { errorResponse } from './respond'

/** The header the page sends the per-run token in. */
export const TOKEN_HEADER = 'x-bundle-grep-token'

/** Compares two secrets in time that does not depend on where they differ. */
export function sameSecret(given: string, expected: string): boolean {
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
 * - The token must match. The page gets it once, from `POST /api/session`, in
 *   exchange for the one-time code in its URL, and another origin cannot read
 *   the answer. Sending it needs a custom header, which a cross-origin
 *   page cannot add without a CORS preflight that the server never grants.
 * - A request that is not a `GET` or `HEAD` must also carry the server's own
 *   `Origin`.
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
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.headers.get('origin') !== `http://${options.host}`) {
    return errorResponse(403, { _tag: 'ForbiddenError', message: 'Unexpected Origin header' })
  }
  return undefined
}
