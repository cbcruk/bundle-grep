/**
 * The read-only `/api/` routes that describe the archive.
 *
 * @module
 */

import { languageNames, loadArchivedRepos, readMetadata, symbolLanguages, type ArchiveEntry } from '@bundle-grep/core'

import type { ArchiveRouteOptions, RepoList, RepoRow, RepoState, Settings } from '../desktop.types'
import { toWireError } from '../wire-error'
import { errorResponse, jsonResponse } from './respond'

async function rowOf(entry: ArchiveEntry, state: RepoState): Promise<RepoRow> {
  const metadata = await readMetadata(entry.paths.metadata)
  return { name: `${entry.owner}/${entry.name}`, state, metadata: metadata.unwrapOr(undefined) ?? null }
}

function byName(a: RepoRow, b: RepoRow): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

/** `GET /api/repos`: every archived repository and its state, as a {@linkcode RepoList}. */
export async function reposRoute(options: ArchiveRouteOptions): Promise<Response> {
  const loaded = await loadArchivedRepos(options.layout)
  if (loaded.isErr()) return errorResponse(500, toWireError(loaded.error))
  const { repos, unrestored, empty, invalid } = loaded.value
  const rows = [
    ...repos.map(repo => ({ name: repo.name, state: 'ready' as const, metadata: repo.metadata ?? null })),
    ...(await Promise.all(unrestored.map(entry => rowOf(entry, 'unrestored')))),
    ...(await Promise.all(empty.map(entry => rowOf(entry, 'empty')))),
  ].sort(byName)
  const list: RepoList = { repos: rows, invalid: invalid.map(error => error.message) }
  return jsonResponse(list)
}

/** `GET /api/settings`: where the archive lives, as {@linkcode Settings}. */
export function settingsRoute(options: ArchiveRouteOptions): Response {
  const settings: Settings = { root: options.root, archiveDir: options.layout.archiveDir, cacheDir: options.layout.cacheDir }
  return jsonResponse(settings)
}

/** `GET /api/languages`: the names `language:` accepts, popular ones first. */
export function languagesRoute(): Response {
  return jsonResponse(languageNames())
}

/** `GET /api/symbol-languages`: the languages `symbol:` finds definitions in. */
export function symbolLanguagesRoute(): Response {
  return jsonResponse(symbolLanguages())
}
