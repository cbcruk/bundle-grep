/**
 * Serves the bundle-grep search page.
 *
 * @module
 */

import { Result } from 'better-result'
import { randomBytes } from 'node:crypto'

import { createApi } from './api/create-api'
import { errorResponse } from './api/respond'
import { sessionRoute } from './api/session-route'
import { ServeError, UiNotBuiltError } from './desktop.errors'
import type { AppServer, ServeAppError, ServeAppOptions, UiSource } from './desktop.types'

/**
 * Serves the API and the UI on `127.0.0.1`, for a browser to open.
 *
 * The UI is the one `pnpm build:ui` embedded, or `devServer`'s, proxied so
 * that the page and the API share an origin; without either, it fails with a
 * {@linkcode UiNotBuiltError} before listening. Every request must carry the
 * server's own `Host`. A fresh token is made for this run; the fragment of
 * {@linkcode AppServer.url} holds a one-time code that the page trades for
 * it at `POST /api/session`. Stopping the server, or
 * `signal`, stops a running sync or restore.
 *
 * @returns The running server, or why it could not start.
 *
 * @example Serving until Ctrl-C
 * ```ts
 * import { serveApp } from "@bundle-grep/desktop";
 *
 * const server = (await serveApp({ layout: { archiveDir: "./archive", cacheDir: "./cache" }, root: "." })).unwrap();
 * console.log(`Open ${server.url}`);
 * process.once("SIGINT", () => void server.stop());
 * ```
 */
export async function serveApp(options: ServeAppOptions): Promise<Result<AppServer, ServeAppError>> {
  const ui = options.devServer ? Result.ok<UiSource>({ origin: options.devServer }) : await embeddedPage()
  if (ui.isErr()) return ui

  const stopped = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, stopped.signal]) : stopped.signal
  const token = randomBytes(32).toString('base64url')
  const code = randomBytes(32).toString('base64url')
  let handle: (request: Request) => Response | Promise<Response> = () => new Response(null, { status: 503 })

  const served = Result.try({
    try: () => Bun.serve({ hostname: '127.0.0.1', port: options.port ?? 0, fetch: request => handle(request) }),
    catch: cause => new ServeError({ message: `Could not listen on 127.0.0.1: ${cause instanceof Error ? cause.message : String(cause)}`, cause }),
  })
  if (served.isErr()) return served
  const server = served.value
  const host = `127.0.0.1:${server.port}`
  const api = createApi({ ...options, host, token, signal })
  const page = uiHandler(ui.value)
  const session = sessionRoute({ host, code, token })

  handle = async (request): Promise<Response> => {
    if (request.headers.get('host') !== host) {
      return errorResponse(403, { _tag: 'ForbiddenError', message: 'Unexpected Host header' })
    }
    if (new URL(request.url).pathname === '/api/session') return session(request)
    return (await api(request)) ?? page(request)
  }

  return Result.ok({
    url: `http://${host}/#code=${code}`,
    stop: async () => {
      stopped.abort()
      await server.stop(true)
    },
  })
}

/**
 * Loads the UI that `pnpm build:ui` bundled into one HTML file.
 *
 * The import is dynamic so that a checkout without a built UI can still run
 * the CLI and `ui --dev-server`; `bun build --compile` embeds the file all the
 * same, because the specifier is a literal.
 */
async function embeddedPage(): Promise<Result<UiSource, UiNotBuiltError>> {
  return Result.tryPromise({
    try: async () => ({ page: (await import('../www/dist/index.html', { with: { type: 'text' } })).default as unknown as string }),
    catch: () =>
      new UiNotBuiltError({ message: 'The UI has not been built; run `pnpm build:ui`, or pass --dev-server' }),
  })
}

function uiHandler(ui: UiSource): (request: Request) => Response | Promise<Response> {
  if ('origin' in ui) return request => proxy(request, ui.origin)
  return request => {
    const { pathname } = new URL(request.url)
    if (pathname !== '/') return errorResponse(404, { _tag: 'NotFoundError', message: `Nothing at ${pathname}` })
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(405, { _tag: 'MethodNotAllowedError', message: `${request.method} is not allowed` })
    }
    return new Response(ui.page, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY',
      },
    })
  }
}

/**
 * Forwards a request for the UI to the dev server, as plain HTTP.
 *
 * The target keeps the dev server's origin whatever the path, so `//host/x`
 * is a path there rather than another host.
 */
async function proxy(request: Request, origin: string): Promise<Response> {
  const { pathname, search } = new URL(request.url)
  const target = new URL(origin)
  target.pathname = pathname
  target.search = search
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('accept-encoding')
  const forwarded = await Result.tryPromise(() =>
    fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
      signal: request.signal,
    }),
  )
  if (forwarded.isErr()) {
    return errorResponse(502, { _tag: 'DevServerError', message: `The dev server at ${origin} did not answer` })
  }
  return forwarded.value
}
