/**
 * Runs a sync or restore through the API.
 *
 * @module
 */

import type { JobStreamEvent, RestoreItem, SyncItem } from '../../../src/desktop.types'
import { readNdjson } from '../lib/ndjson'
import type { ApiResult, Job } from './api.types'
import { request, thrownError } from './request'

/**
 * Streams a sync's or restore's items to `onItem` as they happen.
 *
 * @returns Once the work is over: an error when the server refused it, such
 * as a `BusyError` while another one runs, or the connection dropped.
 */
export async function runJob(job: Job, onItem: (item: SyncItem | RestoreItem) => void): Promise<ApiResult<void>> {
  const response =
    job.kind === 'sync'
      ? await request('/api/sync', { method: 'POST', body: { sources: job.sources } })
      : await request('/api/restore', { method: 'POST' })
  if (!response.ok) return response
  try {
    for await (const event of readNdjson(response.value.body!)) {
      const typed = event as JobStreamEvent<SyncItem | RestoreItem>
      if (typed.type !== 'heartbeat') onItem(typed)
    }
    return { ok: true, value: undefined }
  } catch (error) {
    return { ok: false, error: thrownError(error) }
  }
}
