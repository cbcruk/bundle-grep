/**
 * Opens the bundle-grep window.
 *
 * @module
 */

import { launch, type App } from 'barlo'
import { Result } from 'better-result'
import { randomBytes } from 'node:crypto'

import { createApi } from './api/create-api'
import { createBridge } from './bridge/create-bridge'
import { UiNotBuiltError } from './desktop.errors'
import type { OpenAppError, OpenAppOptions, UiSource } from './desktop.types'

/**
 * Launches Chrome in app mode, mounts the API and bridge, and loads the UI.
 *
 * The UI is the one `pnpm build:ui` embedded, or `devServer`'s; without
 * either, it fails with a {@linkcode UiNotBuiltError} before Chrome starts.
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
  const ui = options.devServer ? Result.ok<UiSource>({ origin: options.devServer }) : await embeddedPage()
  if (ui.isErr()) return ui

  const launched = await launch({ title: 'bundle-grep', width: 1200, height: 800, ...options.launch })
  if (launched.isErr()) return launched
  const app = launched.value

  const opened = await mount(app, options, ui.value)
  if (opened.isErr()) app.exit()
  return opened
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

async function mount(app: App, options: OpenAppOptions, ui: UiSource): Promise<Result<App, OpenAppError>> {
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

  if ('origin' in ui) app.serveOrigin(ui.origin)
  else app.serveEmbedded({ 'index.html': ui.page })
  const loaded = await app.load('origin' in ui ? '' : 'index.html')
  return loaded.map(() => app)
}
