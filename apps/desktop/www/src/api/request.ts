/**
 * Calls the app's HTTP API with this run's token.
 *
 * @module
 */

import type { ApiResult, RequestOptions, WireError } from './api.types'
import { apiToken } from './token'

/** Describes a thrown error, such as a failed `fetch`, as a {@linkcode WireError}. */
export function thrownError(error: unknown): WireError {
  if (error instanceof DOMException && error.name === 'AbortError') return { _tag: 'AbortError', message: 'Cancelled' }
  return { _tag: 'NetworkError', message: error instanceof Error ? error.message : String(error) }
}

/**
 * Fetches an API path, turning an error status into its {@linkcode WireError}.
 *
 * A `body` is sent as JSON with a `POST`.
 *
 * @returns The response for a 2xx status.
 */
export async function request(path: string, options: RequestOptions = {}): Promise<ApiResult<Response>> {
  const token = await apiToken()
  if (!token.ok) return token
  const { signal, method = 'GET', body } = options
  try {
    const headers: Record<string, string> = { 'x-bundle-grep-token': token.value }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal })
    if (response.ok) return { ok: true, value: response }
    const failure = (await response.json().catch(() => undefined)) as { error?: WireError } | undefined
    return { ok: false, error: failure?.error ?? { _tag: 'HttpError', message: `The server answered ${response.status}` } }
  } catch (error) {
    return { ok: false, error: thrownError(error) }
  }
}

/** Fetches an API path that answers with JSON, and parses it. */
export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const response = await request(path, options)
  if (!response.ok) return response
  try {
    return { ok: true, value: (await response.value.json()) as T }
  } catch (error) {
    return { ok: false, error: thrownError(error) }
  }
}
