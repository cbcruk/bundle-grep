/**
 * Runs a sync or restore from the page.
 *
 * @module
 */

import { restoreAll, syncSources } from '../functions/jobs.functions'
import { thrownError } from '../lib/wire-error'
import type { ApiResult, RestoreItem, SyncItem } from './api.types'
import type { Job } from './run-job.types'

/**
 * Streams a sync's or restore's items to `onItem` as they happen.
 *
 * Aborting `signal` stops the work on the server.
 *
 * @returns Once the work is over: an error when the server refused it, such
 * as a `BusyError` while another one runs, or the connection dropped.
 */
export async function runJob(job: Job, onItem: (item: SyncItem | RestoreItem) => void, signal: AbortSignal): Promise<ApiResult<void>> {
  try {
    const started: ApiResult<ReadableStream<SyncItem | RestoreItem>> =
      job.kind === 'sync' ? await syncSources({ data: { sources: job.sources }, signal }) : await restoreAll({ signal })
    if (!started.ok) return started
    const reader = started.value.getReader()
    const cancel = (): void => void reader.cancel()
    signal.addEventListener('abort', cancel, { once: true })
    try {
      for (let next = await reader.read(); !next.done; next = await reader.read()) onItem(next.value)
    } finally {
      signal.removeEventListener('abort', cancel)
    }
    return { ok: true, value: undefined }
  } catch (error) {
    return { ok: false, error: thrownError(error) }
  }
}
