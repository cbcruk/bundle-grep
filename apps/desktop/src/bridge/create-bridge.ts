/**
 * The functions the app exposes to its page through barlo's bridge.
 *
 * @module
 */

import {
  listArchive,
  loadArchivedRepos,
  readMetadata,
  resolveSyncSource,
  restoreRepos,
  syncRepos,
  type ArchiveEntry,
  type SyncTarget,
} from '@bundle-grep/core'

import type { Bridge, BridgeOptions, BridgeResult, RepoRow, RepoState, RestoreItem, SyncItem } from '../desktop.types'
import { toWireError } from '../wire-error'

function ok<T>(value: T): BridgeResult<T> {
  return { ok: true, value }
}

function usage<T>(message: string): BridgeResult<T> {
  return { ok: false, error: { _tag: 'UsageError', message } }
}

async function rowOf(entry: ArchiveEntry, state: RepoState): Promise<RepoRow> {
  const metadata = await readMetadata(entry.paths.metadata)
  return { name: `${entry.owner}/${entry.name}`, state, metadata: metadata.unwrapOr(undefined) ?? null }
}

function byName(a: RepoRow, b: RepoRow): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

/**
 * Builds the bridge functions, keyed by the names they are exposed under.
 *
 * Each resolves to a {@linkcode BridgeResult} instead of throwing, since the
 * bridge hands a thrown error to the page as a bare string. Sync and restore
 * write to the archive, so only one of them runs at a time; a second call
 * while one is running fails with a `BusyError`.
 *
 * @example Exposing the bridge in a barlo app
 * ```ts
 * import { createBridge } from "@bundle-grep/desktop";
 * import { launch } from "barlo";
 *
 * const app = (await launch()).unwrap();
 * const layout = { archiveDir: "./archive", cacheDir: "./cache" };
 *
 * for (const [name, fn] of Object.entries(createBridge({ layout, root: "." }))) await app.exposeFunction(name, fn);
 * ```
 */
export function createBridge(options: BridgeOptions): Bridge {
  const { layout, signal } = options
  let busy = false

  const exclusive = async <T>(work: () => Promise<BridgeResult<T>>): Promise<BridgeResult<T>> => {
    if (busy) return { ok: false, error: { _tag: 'BusyError', message: 'A sync or restore is already running' } }
    busy = true
    try {
      return await work()
    } finally {
      busy = false
    }
  }

  return {
    bundleGrepListRepos: async () => {
      const loaded = await loadArchivedRepos(layout)
      if (loaded.isErr()) return { ok: false, error: toWireError(loaded.error) }
      const { repos, unrestored, empty, invalid } = loaded.value
      const rows = [
        ...repos.map(repo => ({ name: repo.name, state: 'ready' as const, metadata: repo.metadata ?? null })),
        ...(await Promise.all(unrestored.map(entry => rowOf(entry, 'unrestored')))),
        ...(await Promise.all(empty.map(entry => rowOf(entry, 'empty')))),
      ].sort(byName)
      return ok({ repos: rows, invalid: invalid.map(error => error.message) })
    },

    bundleGrepSync: async sources => {
      if (!Array.isArray(sources) || sources.length === 0 || !sources.every(source => typeof source === 'string' && source.trim() !== '')) {
        return usage('sync takes a non-empty array of sources')
      }
      return exclusive(async () => {
        const items: SyncItem[] = []
        const targets = new Map<string, SyncTarget>()
        for (const source of sources as string[]) {
          const found = await resolveSyncSource(source, { gh: options.gh, signal })
          if (found.isErr()) {
            items.push({ type: 'failed', subject: source, error: toWireError(found.error) })
            continue
          }
          if (found.value.warning) items.push({ type: 'warning', source, message: found.value.warning })
          for (const target of found.value.targets) {
            const key = `${target.owner}/${target.name}`.toLowerCase()
            if (!targets.has(key)) targets.set(key, target)
          }
        }
        for await (const event of syncRepos(targets.values(), { ...layout, env: options.syncEnv, signal })) {
          const repo = `${event.target.owner}/${event.target.name}`
          items.push(
            event.type === 'failed'
              ? { type: 'failed', subject: repo, error: toWireError(event.error) }
              : { type: 'synced', repo, status: event.outcome.status },
          )
        }
        return ok(items)
      })
    },

    bundleGrepRestore: () =>
      exclusive(async () => {
        const listed = await listArchive(layout)
        if (listed.isErr()) return { ok: false, error: toWireError(listed.error) }
        const items: RestoreItem[] = []
        for await (const event of restoreRepos(listed.value, { ...layout, signal })) {
          const repo = `${event.entry.owner}/${event.entry.name}`
          items.push(
            event.type === 'failed'
              ? { type: 'failed', subject: repo, error: toWireError(event.error) }
              : { type: 'restored', repo, status: event.outcome.status },
          )
        }
        return ok(items)
      }),

    bundleGrepSettings: async () => ok({ root: options.root, archiveDir: layout.archiveDir, cacheDir: layout.cacheDir }),
  }
}
