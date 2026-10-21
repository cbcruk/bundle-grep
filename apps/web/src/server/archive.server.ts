/**
 * Reads what the archive holds.
 *
 * @module
 */

import { languageNames, loadArchivedRepos, readMetadata, symbolLanguages, type ArchiveEntry, type ArchiveLayout } from '@bundle-grep/core'

import type { ArchiveIndex, ApiResult, RepoList, RepoRow, RepoState, Settings } from '../api/api.types'
import type { WebConfig } from './web-config.types'
import { toWireError } from '../lib/wire-error'

async function rowOf(entry: ArchiveEntry, state: RepoState): Promise<RepoRow> {
  const metadata = await readMetadata(entry.paths.metadata)
  return { name: `${entry.owner}/${entry.name}`, state, metadata: metadata.unwrapOr(undefined) ?? null }
}

function byName(a: RepoRow, b: RepoRow): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

/** Lists every archived repository and its state, sorted by name. */
export async function listRepos(layout: ArchiveLayout): Promise<ApiResult<RepoList>> {
  const loaded = await loadArchivedRepos(layout)
  if (loaded.isErr()) return { ok: false, error: toWireError(loaded.error) }
  const { repos, unrestored, empty, invalid } = loaded.value
  const rows = [
    ...repos.map(repo => ({ name: repo.name, state: 'ready' as const, metadata: repo.metadata ?? null })),
    ...(await Promise.all(unrestored.map(entry => rowOf(entry, 'unrestored')))),
    ...(await Promise.all(empty.map(entry => rowOf(entry, 'empty')))),
  ].sort(byName)
  return { ok: true, value: { repos: rows, invalid: invalid.map(error => error.message) } }
}

/** The repositories and the names completion offers, as every screen needs them. */
export async function archiveIndex(layout: ArchiveLayout): Promise<ArchiveIndex> {
  return { repos: await listRepos(layout), languages: languageNames(), symbolLanguages: symbolLanguages() }
}

/** Where the archive lives, as the repository list shows it. */
export function settingsOf(config: Pick<WebConfig, 'layout' | 'root'>): Settings {
  return { root: config.root, archiveDir: config.layout.archiveDir, cacheDir: config.layout.cacheDir }
}
