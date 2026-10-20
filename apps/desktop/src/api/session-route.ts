/**
 * `POST /api/session`: trades the one-time code in the page's URL for the token.
 *
 * @module
 */

import type { SessionRouteOptions } from '../desktop.types'
import { sameSecret } from './guard'
import { errorResponse, jsonResponse } from './respond'

/**
 * Builds the handler that hands the page this run's token, once.
 *
 * The URL `bundle-grep ui` opens carries a code rather than the token, since
 * the URL is passed to the browser on its command line, printed, and kept in
 * browser history. The first request with the right code and the server's own
 * `Origin` gets the token, as `{ "token": … }`, and the code stops working.
 * Any other request is a `403`.
 */
export function sessionRoute(options: SessionRouteOptions): (request: Request) => Promise<Response> {
  let used = false
  return async request => {
    if (request.method !== 'POST' || request.headers.get('origin') !== `http://${options.host}`) {
      return errorResponse(403, { _tag: 'ForbiddenError', message: 'Unexpected method or Origin header' })
    }
    const body = (await request.json().catch(() => undefined)) as { code?: unknown } | undefined
    const code = typeof body?.code === 'string' ? body.code : ''
    if (used || !sameSecret(code, options.code)) {
      return errorResponse(403, {
        _tag: 'ForbiddenError',
        message: 'This link was already used or is not this run’s; use the tab it opened, or restart `bundle-grep ui`',
      })
    }
    used = true
    return jsonResponse({ token: options.token })
  }
}
