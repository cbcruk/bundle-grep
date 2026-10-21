/**
 * Holds this run's {@linkcode WebConfig} for the server functions.
 *
 * @module
 */

import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import type { WebConfig, WebState, WebStateHolder } from './web-config.types'

const KEY = Symbol.for('bundle-grep.web-state')

/**
 * Sets this run's configuration, before the server takes requests.
 *
 * The host that serves the built app calls it once with the layout and a
 * fresh code and token; the one-time code starts unused.
 *
 * @example Configuring the built server
 * ```ts
 * import { configure } from "@bundle-grep/web/server";
 *
 * configure({
 *   layout: { archiveDir: "./archive", cacheDir: "./cache" },
 *   root: ".",
 *   host: "127.0.0.1:4100",
 *   code: "one-time-code",
 *   token: "session-secret",
 * });
 * ```
 */
export function configure(config: WebConfig): void {
  ;(globalThis as WebStateHolder)[KEY] = { config, codeUsed: false, busy: false }
}

/**
 * The state of this run: the configuration, and what has happened since.
 *
 * Under `vite dev`, which has no host to configure it, it is made from the
 * environment on first use: the root is `BUNDLE_GREP_ROOT` or
 * `~/.bundle-grep`, the port `BUNDLE_GREP_DEV_PORT` or 5173, and the code
 * `BUNDLE_GREP_DEV_CODE`, which the dev server sets and prints.
 *
 * @throws When nothing configured it and no dev server set a code.
 */
export function webState(): WebState {
  const holder = globalThis as WebStateHolder
  holder[KEY] ??= { config: devConfig(), codeUsed: false, busy: false }
  return holder[KEY]
}

/** This run's configuration. */
export function webConfig(): WebConfig {
  return webState().config
}

function devConfig(): WebConfig {
  const code = process.env.BUNDLE_GREP_DEV_CODE
  if (!code) throw new Error('The bundle-grep web server was not configured')
  const root = resolve(process.env.BUNDLE_GREP_ROOT || join(homedir(), '.bundle-grep'))
  return {
    layout: { archiveDir: join(root, 'archive'), cacheDir: join(root, 'cache') },
    root,
    host: `127.0.0.1:${process.env.BUNDLE_GREP_DEV_PORT ?? '5173'}`,
    code,
    token: randomBytes(32).toString('base64url'),
  }
}
