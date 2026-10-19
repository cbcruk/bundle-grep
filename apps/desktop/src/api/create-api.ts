/**
 * The `/api/` request handler the app server mounts.
 *
 * @module
 */

import type { RequestHandler } from 'barlo'

import type { ApiOptions } from '../desktop.types'
import { blobRoute } from './blob-route'
import { guard } from './guard'
import { errorResponse } from './respond'
import { searchRoute } from './search-route'

/**
 * Builds the handler for every `/api/` path.
 *
 * Paths outside `/api/` are declined, so the UI's files are served by the
 * routes behind it. Every `/api/` request passes the {@linkcode guard} first,
 * and an unknown one is a `404` rather than falling through to the UI.
 *
 * @example Mounting the API in a barlo app
 * ```ts
 * import { createApi } from "@bundle-grep/desktop";
 * import { launch } from "barlo";
 *
 * const app = (await launch()).unwrap();
 * const host = (await app.evaluate<string>("location.host")).unwrap();
 *
 * app.serveHandler(createApi({ layout: { archiveDir: "./archive", cacheDir: "./cache" }, host, token: "secret" }));
 * ```
 */
export function createApi(options: ApiOptions): RequestHandler {
  return request => {
    const { pathname } = new URL(request.url)
    if (pathname !== '/api' && !pathname.startsWith('/api/')) return undefined

    const refused = guard(request, options)
    if (refused) return refused
    if (pathname === '/api/search') return searchRoute(request, options.layout)
    if (pathname.startsWith('/api/blob/')) return blobRoute(request, options.layout)
    return errorResponse(404, { _tag: 'NotFoundError', message: `No API at ${pathname}` })
  }
}
