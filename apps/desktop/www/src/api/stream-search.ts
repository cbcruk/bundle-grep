/**
 * Runs a search against `GET /api/search`.
 *
 * @module
 */

import { readNdjson } from '../lib/ndjson'
import type { BridgeResult, SearchStreamEvent, StreamSearchOptions } from './api.types'
import { request, thrownError } from './request'

/**
 * Streams a search's events to `onEvent` as they arrive.
 *
 * @returns Once the stream ends: an error for a query the server rejects,
 * a dropped connection, or an abort (tagged `AbortError`).
 */
export async function streamSearch(options: StreamSearchOptions): Promise<BridgeResult<void>> {
  const { q, limit, context, signal, onEvent } = options
  const params = new URLSearchParams({ q, limit: String(limit), context: String(context) })
  const response = await request(`/api/search?${params}`, signal)
  if (!response.ok) return response
  try {
    for await (const event of readNdjson(response.value.body!)) {
      const typed = event as SearchStreamEvent
      if (typed.type !== 'heartbeat') onEvent(typed)
    }
    return { ok: true, value: undefined }
  } catch (error) {
    return { ok: false, error: thrownError(error) }
  }
}
