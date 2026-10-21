/**
 * Runs sync and restore, one at a time, as streams of what happened.
 *
 * @module
 */

import { listArchive, resolveSyncSource, restoreRepos, syncRepos, type ArchiveEntry, type SyncTarget } from '@bundle-grep/core'

import type { ApiResult, RestoreItem, SyncItem } from '../api/api.types'
import { iteratorStream } from './iterator-stream'
import type { WebConfig, WebState } from './web-config.types'
import { toWireError } from '../lib/wire-error'

async function* syncItems(sources: string[], config: WebConfig, signal: AbortSignal): AsyncGenerator<SyncItem, void> {
  const targets = new Map<string, SyncTarget>()
  for (const source of sources) {
    const found = await resolveSyncSource(source, { gh: config.gh, signal })
    if (found.isErr()) {
      yield { type: 'failed', subject: source, error: toWireError(found.error) }
      continue
    }
    if (found.value.warning) yield { type: 'warning', source, message: found.value.warning }
    for (const target of found.value.targets) {
      const key = `${target.owner}/${target.name}`.toLowerCase()
      if (!targets.has(key)) targets.set(key, target)
    }
  }
  for await (const event of syncRepos(targets.values(), { ...config.layout, env: config.syncEnv, signal })) {
    const repo = `${event.target.owner}/${event.target.name}`
    yield event.type === 'failed'
      ? { type: 'failed', subject: repo, error: toWireError(event.error) }
      : { type: 'synced', repo, status: event.outcome.status }
  }
}

async function* restoreItems(entries: ArchiveEntry[], config: WebConfig, signal: AbortSignal): AsyncGenerator<RestoreItem, void> {
  for await (const event of restoreRepos(entries, { ...config.layout, signal })) {
    const repo = `${event.entry.owner}/${event.entry.name}`
    yield event.type === 'failed'
      ? { type: 'failed', subject: repo, error: toWireError(event.error) }
      : { type: 'restored', repo, status: event.outcome.status }
  }
}

function exclusive<T>(
  state: WebState,
  work: (signal: AbortSignal) => AsyncIterator<T, void>,
  signal: AbortSignal | undefined,
): ApiResult<ReadableStream<T>> {
  if (state.busy) return { ok: false, error: { _tag: 'BusyError', message: 'A sync or restore is already running' } }
  state.busy = true
  const stop = new AbortController()
  const signals = [stop.signal, signal, state.config.signal].filter(value => value !== undefined)
  const stream = iteratorStream(work(AbortSignal.any(signals)), {
    onCancel: () => stop.abort(),
    onClose: () => (state.busy = false),
  })
  return { ok: true, value: stream }
}

/**
 * Starts a sync of `sources`, the sources `bundle-grep sync` takes, and
 * streams what happens to each as it happens.
 *
 * Sync and restore share one lock: while either runs, starting another is a
 * `BusyError`. Cancelling the stream, `signal`, or the configuration's
 * signal stops the work; repositories already done stay done, and the lock
 * is released once the step in progress ends.
 */
export function startSync(state: WebState, sources: string[], signal?: AbortSignal): ApiResult<ReadableStream<SyncItem>> {
  return exclusive(state, any => syncItems(sources, state.config, any), signal)
}

/** Starts rebuilding every search cache from its bundle, as {@linkcode startSync} starts a sync. */
export async function startRestore(state: WebState, signal?: AbortSignal): Promise<ApiResult<ReadableStream<RestoreItem>>> {
  const listed = await listArchive(state.config.layout)
  if (listed.isErr()) return { ok: false, error: toWireError(listed.error) }
  return exclusive(state, any => restoreItems(listed.value, state.config, any), signal)
}
