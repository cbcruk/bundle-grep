/**
 * The `/api/` request handler the app server mounts.
 *
 * @module
 */

import type { ApiHandler, ApiOptions, ApiRoute } from '../desktop.types'
import { languagesRoute, reposRoute, settingsRoute, symbolLanguagesRoute } from './archive-routes'
import { blobRoute } from './blob-route'
import { guard } from './guard'
import { jobRoutes } from './job-routes'
import { errorResponse } from './respond'
import { searchRoute } from './search-route'

/**
 * Builds the handler for every `/api/` path.
 *
 * Paths outside `/api/` are declined, so the UI's files are served by the
 * routes behind it. Every `/api/` request passes the guard first — the
 * server's own `Host`, the token, and for a `POST` the server's own `Origin` —
 * and an unknown one is a `404` rather than falling through to the UI.
 * `POST /api/session`, which hands out the token, is served by
 * {@linkcode serveApp} itself, ahead of this handler.
 *
 * | Route | Answers with |
 * | --- | --- |
 * | `GET /api/search` | the search's events as NDJSON |
 * | `GET /api/blob/<owner>/<repo>/<ref>/<path>` | a file's bytes |
 * | `GET /api/repos` | a {@linkcode RepoList} |
 * | `GET /api/settings` | {@linkcode Settings} |
 * | `GET /api/languages`, `GET /api/symbol-languages` | names, as a JSON array |
 * | `POST /api/sync`, `POST /api/restore` | their items as NDJSON |
 *
 * @example Serving the API
 * ```ts
 * import { createApi } from "@bundle-grep/desktop";
 *
 * const layout = { archiveDir: "./archive", cacheDir: "./cache" };
 * const api = createApi({ layout, root: ".", host: "127.0.0.1:4100", token: "secret" });
 *
 * Bun.serve({ hostname: "127.0.0.1", port: 4100, fetch: async request => (await api(request)) ?? new Response(null, { status: 404 }) });
 * ```
 */
export function createApi(options: ApiOptions): ApiHandler {
  const jobs = jobRoutes(options)
  const routes: Record<string, ApiRoute> = {
    '/api/search': { method: 'GET', handle: request => searchRoute(request, options) },
    '/api/repos': { method: 'GET', handle: () => reposRoute(options) },
    '/api/settings': { method: 'GET', handle: () => settingsRoute(options) },
    '/api/languages': { method: 'GET', handle: languagesRoute },
    '/api/symbol-languages': { method: 'GET', handle: symbolLanguagesRoute },
    '/api/sync': { method: 'POST', handle: jobs.sync },
    '/api/restore': { method: 'POST', handle: jobs.restore },
  }
  const blob: ApiRoute = { method: 'GET', handle: request => blobRoute(request, options.layout) }

  return request => {
    const { pathname } = new URL(request.url)
    if (pathname !== '/api' && !pathname.startsWith('/api/')) return undefined

    const refused = guard(request, options)
    if (refused) return refused
    const route = pathname.startsWith('/api/blob/') ? blob : Object.hasOwn(routes, pathname) ? routes[pathname] : undefined
    if (!route) return errorResponse(404, { _tag: 'NotFoundError', message: `No API at ${pathname}` })
    if (request.method !== route.method && !(route.method === 'GET' && request.method === 'HEAD')) {
      return errorResponse(405, { _tag: 'MethodNotAllowedError', message: `${request.method} is not allowed` })
    }
    return route.handle(request)
  }
}
