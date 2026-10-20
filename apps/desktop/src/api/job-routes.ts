/**
 * `POST /api/sync` and `POST /api/restore`: the routes that change the archive.
 *
 * @module
 */

import { listArchive, resolveSyncSource, restoreRepos, syncRepos, type ArchiveEntry, type SyncTarget } from '@bundle-grep/core'
import { Result } from 'better-result'

import type { JobRouteOptions, JobRoutes, RestoreItem, SyncItem, SyncRequest } from '../desktop.types'
import { toWireError } from '../wire-error'
import { ndjsonResponse } from './ndjson-response'
import { errorResponse } from './respond'

function usage(message: string): Response {
  return errorResponse(400, { _tag: 'UsageError', message })
}

async function sourcesOf(request: Request): Promise<string[] | undefined> {
  const body = await Result.tryPromise(() => request.json() as Promise<Partial<SyncRequest> | null>)
  const sources = body.isOk() ? body.value?.sources : undefined
  if (!Array.isArray(sources) || sources.length === 0) return undefined
  return sources.every(source => typeof source === 'string' && source.trim() !== '') ? sources : undefined
}

/**
 * Builds the sync and restore routes, which share one lock.
 *
 * Both stream their items as NDJSON as they happen, with heartbeats, and the
 * stream ends when the work does. Only one runs at a time: another request
 * while one is running is a `409` `BusyError`. Closing the connection stops
 * the work, as does `signal`; repositories already done stay done.
 *
 * - `/api/sync` takes `{ "sources": [...] }`, the sources `bundle-grep sync`
 *   takes, and streams {@linkcode SyncItem}s.
 * - `/api/restore` takes no body and streams {@linkcode RestoreItem}s.
 */
export function jobRoutes(options: JobRouteOptions): JobRoutes {
  const { layout, heartbeatMs } = options
  let busy = false

  const exclusive = <T>(request: Request, work: (signal: AbortSignal) => AsyncIterator<T, void>): Response => {
    if (busy) return errorResponse(409, { _tag: 'BusyError', message: 'A sync or restore is already running' })
    busy = true
    const stop = new AbortController()
    const signal = AbortSignal.any([request.signal, stop.signal, ...(options.signal ? [options.signal] : [])])
    return ndjsonResponse(work(signal), { heartbeatMs, onCancel: () => stop.abort(), onClose: () => (busy = false) })
  }

  async function* sync(sources: string[], signal: AbortSignal): AsyncGenerator<SyncItem, void> {
    const targets = new Map<string, SyncTarget>()
    for (const source of sources) {
      const found = await resolveSyncSource(source, { gh: options.gh, signal })
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
    for await (const event of syncRepos(targets.values(), { ...layout, env: options.syncEnv, signal })) {
      const repo = `${event.target.owner}/${event.target.name}`
      yield event.type === 'failed'
        ? { type: 'failed', subject: repo, error: toWireError(event.error) }
        : { type: 'synced', repo, status: event.outcome.status }
    }
  }

  async function* restore(entries: ArchiveEntry[], signal: AbortSignal): AsyncGenerator<RestoreItem, void> {
    for await (const event of restoreRepos(entries, { ...layout, signal })) {
      const repo = `${event.entry.owner}/${event.entry.name}`
      yield event.type === 'failed'
        ? { type: 'failed', subject: repo, error: toWireError(event.error) }
        : { type: 'restored', repo, status: event.outcome.status }
    }
  }

  return {
    sync: async request => {
      const sources = await sourcesOf(request)
      if (!sources) return usage('sync takes { "sources": [...] }, a non-empty array of sources')
      return exclusive(request, signal => sync(sources, signal))
    },
    restore: async request => {
      const listed = await listArchive(layout)
      if (listed.isErr()) return errorResponse(500, toWireError(listed.error))
      return exclusive(request, signal => restore(listed.value, signal))
    },
  }
}
