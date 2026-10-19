/**
 * Calls the app's HTTP API with this run's token.
 *
 * @module
 */

import type { BridgeResult, WireError } from './api.types'
import { apiToken } from './bridge'

/** Describes a thrown error, such as a failed `fetch`, as a {@linkcode WireError}. */
export function thrownError(error: unknown): WireError {
  if (error instanceof DOMException && error.name === 'AbortError') return { _tag: 'AbortError', message: 'Cancelled' }
  return { _tag: 'NetworkError', message: error instanceof Error ? error.message : String(error) }
}

/**
 * Fetches an API path, turning an error status into its {@linkcode WireError}.
 *
 * @returns The response for a 2xx status.
 */
export async function request(path: string, signal: AbortSignal): Promise<BridgeResult<Response>> {
  try {
    const response = await fetch(path, { headers: { 'x-bundle-grep-token': await apiToken() }, signal })
    if (response.ok) return { ok: true, value: response }
    const body = (await response.json().catch(() => undefined)) as { error?: WireError } | undefined
    return { ok: false, error: body?.error ?? { _tag: 'HttpError', message: `The server answered ${response.status}` } }
  } catch (error) {
    return { ok: false, error: thrownError(error) }
  }
}
