/**
 * Serves the built web app for `bundle-grep ui`.
 *
 * @module
 */

import { wasmFile } from '@bundle-grep/core'
import { Result } from 'better-result'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { serve } from 'srvx'
import { staticMiddleware } from 'srvx/static'

import { ServeError, UiNotBuiltError } from './ui.errors'
import type { ServeWebError, ServeWebOptions, WebServer, WebServerModule } from './ui.types'

/**
 * The built web app: `web/` next to the bundle when installed, or the
 * workspace's `apps/web/dist` in a checkout.
 */
function defaultAppDir(): URL | undefined {
  return [new URL('web/', import.meta.url), new URL('../../../../apps/web/dist/', import.meta.url)].find(dir =>
    existsSync(new URL('server/server.js', dir)),
  )
}

/**
 * Serves the web app on `127.0.0.1`, for a browser to open.
 *
 * The client's files are served as they are; every other request goes to the
 * app's server, which the CLI configures with this run's archive, a fresh
 * session secret, and a one-time code for {@linkcode WebServer.url}. The app
 * shares the CLI's WebAssembly files rather than carrying its own. Stopping
 * the server, or `signal`, stops a running sync or restore.
 *
 * @returns The running server, or why it could not start: no built app, or a
 * port it could not listen on.
 *
 * @example Serving until Ctrl-C
 * ```ts
 * import { serveWeb } from "./serve-web";
 *
 * const server = (await serveWeb({ layout: { archiveDir: "./archive", cacheDir: "./cache" }, root: "." })).unwrap();
 * console.log(`Open ${server.url}`);
 * process.once("SIGINT", () => void server.stop());
 * ```
 */
export async function serveWeb(options: ServeWebOptions): Promise<Result<WebServer, ServeWebError>> {
  const dir = options.appDir ?? defaultAppDir()
  if (!dir || !existsSync(new URL('server/server.js', dir))) {
    return Result.err(new UiNotBuiltError({ message: 'The web app has not been built; run `pnpm build:web`' }))
  }
  const app = (await import(new URL('server/server.js', dir).href)) as WebServerModule

  const stopped = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, stopped.signal]) : stopped.signal
  let handle: (request: Request) => Response | Promise<Response> = () => new Response(null, { status: 503 })

  const served = await Result.tryPromise({
    try: () =>
      serve({
        hostname: '127.0.0.1',
        port: options.port ?? 0,
        silent: true,
        gracefulShutdown: false,
        middleware: [staticMiddleware({ dir: fileURLToPath(new URL('client/', dir)) })],
        fetch: request => handle(request),
      }).ready(),
    catch: cause => new ServeError({ message: `Could not listen on 127.0.0.1: ${cause instanceof Error ? cause.message : String(cause)}`, cause }),
  })
  if (served.isErr()) return served
  const server = served.value
  const port = (server.node!.server!.address() as AddressInfo).port
  const code = randomBytes(32).toString('base64url')
  app.configure({
    layout: options.layout,
    root: options.root,
    port,
    code,
    token: randomBytes(32).toString('base64url'),
    gh: options.gh,
    syncEnv: options.syncEnv,
    signal,
    wasmFile,
  })
  handle = (request): Response | Promise<Response> => app.default.fetch(request)

  return Result.ok({
    url: `http://127.0.0.1:${port}/session?code=${code}`,
    stop: async () => {
      stopped.abort()
      await server.close(true)
    },
  })
}
