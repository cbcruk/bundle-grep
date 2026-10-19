/**
 * The app's bridge functions, as the page sees them.
 *
 * barlo defines them on `window` before the page loads, and only on the app's
 * own origin.
 *
 * @module
 */

import type { PageBridge } from './api.types'

/** The bridge functions barlo exposed on `window`. */
export function bridge(): PageBridge {
  return window as unknown as PageBridge
}

let token: Promise<string> | undefined

/** This run's API token, fetched from the bridge once; a failed fetch is tried again next time. */
export function apiToken(): Promise<string> {
  token ??= bridge()
    .bundleGrepToken()
    .catch((error: unknown) => {
      token = undefined
      throw error
    })
  return token
}
