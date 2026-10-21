/**
 * Types for serving the web app.
 *
 * @module
 */

import type { ArchiveLayout } from '@bundle-grep/core'

import type { WebConfig } from '../../../../apps/web/src/server/web-config.types'
import type { ServeError, UiNotBuiltError } from './ui.errors'

/** Options for {@linkcode serveWeb}. */
export interface ServeWebOptions {
  /** Where the archive and its search caches live. */
  layout: ArchiveLayout
  /** The root the layout came from, shown in settings. */
  root: string
  /** The port to listen on; any free one by default. */
  port?: number
  /** The GitHub CLI that sync runs; `gh` on the `PATH` by default. */
  gh?: string
  /** Extra environment for the git that sync runs, such as `GIT_SSH_COMMAND`. */
  syncEnv?: Record<string, string | undefined>
  /** Stops a running sync or restore. */
  signal?: AbortSignal
  /** The built web app's directory, with `client/` and `server/`; found next to the CLI by default. */
  appDir?: URL
}

/** A running {@linkcode serveWeb}. */
export interface WebServer {
  /** The link that trades this run's one-time code for a session, then shows the search page. */
  url: string
  /** Stops a running sync or restore and closes every connection. */
  stop: () => Promise<void>
}

/** Why {@linkcode serveWeb} could not start. */
export type ServeWebError = UiNotBuiltError | ServeError

/** What the built web app's `server/server.js` exports. */
export interface WebServerModule {
  /** Start's request handler. */
  default: { fetch: (request: Request) => Response | Promise<Response> }
  /** Sets the run's configuration before the first request. */
  configure: (config: WebConfig) => void
}
