/**
 * Server functions that change the archive.
 *
 * @module
 */

import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import type { ApiResult, RestoreItem, SyncItem } from '../api/api.types'
import { startRestore, startSync } from '../server/jobs.server'
import { parseSyncInput } from '../server/search-input'
import { webState } from '../server/web-config.server'

/**
 * Syncs sources into the archive, streaming what happens to each.
 *
 * Only one sync or restore runs at a time; another is a `BusyError`. Closing
 * the request stops it.
 */
export const syncSources = createServerFn({ method: 'POST' })
  .validator(parseSyncInput)
  .handler(({ data }): ApiResult<ReadableStream<SyncItem>> => startSync(webState(), data.sources, getRequest().signal))

/** Rebuilds every search cache from its bundle, as {@linkcode syncSources} syncs. */
export const restoreAll = createServerFn({ method: 'POST' }).handler(
  (): Promise<ApiResult<ReadableStream<RestoreItem>>> => startRestore(webState(), getRequest().signal),
)
