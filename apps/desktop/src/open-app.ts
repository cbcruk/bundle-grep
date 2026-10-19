/**
 * Opens the bundle-grep window.
 *
 * @module
 */

import { launch, type App, type EvaluateError, type LaunchError, type LoadError, type WindowError } from 'barlo'
import { Result } from 'better-result'
import { randomBytes } from 'node:crypto'

import page from '../www/index.html' with { type: 'text' }
import { createApi } from './api/create-api'
import { createBridge } from './bridge/create-bridge'
import type { OpenAppOptions } from './desktop.types'

/** Why the window could not be opened. */
export type OpenAppError = LaunchError | EvaluateError | WindowError | LoadError

/**
 * Launches Chrome in app mode, mounts the API and bridge, and loads the UI.
 *
 * The server's `Host` is read from the window itself, since barlo does not
 * report its port. A fresh token
 * is made for this run and handed to the page through the bridge alone. The
 * bridge's sync and restore stop when the app exits.
 *
 * @returns The running app, for the caller to wait on with `onExit`.
 *
 * @example Opening the window and waiting for it to close
 * ```ts
 * import { openApp } from "@bundle-grep/desktop";
 *
 * const app = (await openApp({ layout: { archiveDir: "./archive", cacheDir: "./cache" }, root: "." })).unwrap();
 *
 * await new Promise<void>(resolve => app.onExit(resolve));
 * ```
 */
export async function openApp(options: OpenAppOptions): Promise<Result<App, OpenAppError>> {
  const launched = await launch({ title: 'bundle-grep', width: 1200, height: 800, ...options.launch })
  if (launched.isErr()) return launched
  const app = launched.value

  const opened = await mount(app, options)
  if (opened.isErr()) app.exit()
  return opened
}

/**
 * Reads the server's `host:port` from the window, since barlo does not report it.
 *
 * The window starts on `about:blank`, so it first visits the origin's root.
 * Nothing is mounted yet, so that is barlo's own 404 page, but it is on the
 * origin, which is all that is needed.
 */
async function originHost(app: App): Promise<Result<string, OpenAppError>> {
  const visited = await app.load('')
  if (visited.isErr()) return visited
  return app.evaluate<string>('location.host')
}

async function mount(app: App, options: OpenAppOptions): Promise<Result<App, OpenAppError>> {
  const host = await originHost(app)
  if (host.isErr()) return host

  const closed = new AbortController()
  app.onExit(() => closed.abort())
  const signal = options.signal ? AbortSignal.any([options.signal, closed.signal]) : closed.signal
  const token = randomBytes(32).toString('base64url')

  app.serveHandler(createApi({ layout: options.layout, host: host.value, token }))
  const bridge = { ...createBridge({ ...options, signal }), bundleGrepToken: (): string => token }
  for (const [name, fn] of Object.entries(bridge)) {
    const exposed = await app.exposeFunction(name, fn)
    if (exposed.isErr()) return exposed
  }

  if (options.devServer) app.serveOrigin(options.devServer)
  else app.serveEmbedded({ 'index.html': page as unknown as string })
  const loaded = await app.load(options.devServer ? '' : 'index.html')
  return loaded.map(() => app)
}
