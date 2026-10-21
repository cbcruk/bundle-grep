/**
 * Types for what the app's server needs to know about this run.
 *
 * @module
 */

import type { ArchiveLayout } from '@bundle-grep/core'

/** What the host that serves the app tells it before the first request. */
export interface WebConfig {
  /** Where the archive and its search caches live. */
  layout: ArchiveLayout
  /** The root the layout came from, shown in settings. */
  root: string
  /** The only `Host` header accepted, such as `"127.0.0.1:53124"`. */
  host: string
  /** The one-time code that `GET /session` trades for the session cookie. */
  code: string
  /** The session cookie's value: this run's secret. */
  token: string
  /** The GitHub CLI that sync runs; `gh` on the `PATH` by default. */
  gh?: string
  /** Extra environment for the git that sync runs, such as `GIT_SSH_COMMAND`. */
  syncEnv?: Record<string, string | undefined>
  /** Stops a running sync or restore, such as when the server stops. */
  signal?: AbortSignal
}

/** What the server remembers between requests of one run. */
export interface WebState {
  /** The configuration. */
  config: WebConfig
  /** Whether the one-time code has been traded already. */
  codeUsed: boolean
  /** Whether a sync or restore is running. */
  busy: boolean
}

/**
 * Where {@linkcode WebState} is kept: on `globalThis`, under a registered
 * symbol, so that it survives the dev server reloading modules.
 */
export type WebStateHolder = Record<symbol, WebState | undefined>
