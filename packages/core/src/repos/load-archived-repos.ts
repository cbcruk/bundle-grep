/**
 * Loads the archived repositories a search can run over.
 *
 * @module
 */

import { Result } from 'better-result'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { FileSystemError } from '../archive/archive.errors'
import type { ArchiveLayout } from '../archive/archive.types'
import { listArchive } from '../archive/list-archive'
import { readMetadata } from '../archive/metadata'
import type { LoadedRepos } from './repos.types'

/**
 * Lists an archive's repositories with their metadata, sorted into those
 * ready to search and those that are not.
 *
 * A repository is ready once {@linkcode restoreRepo} has built its cache. One
 * whose metadata says it was empty has nothing to search, and one whose
 * metadata cannot be read is reported rather than failing the whole archive.
 * A bundle without metadata is still searched, with what
 * {@linkcode repoHolds} assumes about it.
 *
 * @returns The repositories, or a {@linkcode FileSystemError} when the
 * archive directory cannot be listed.
 *
 * @example Restoring what is missing before searching
 * ```ts
 * import { loadArchivedRepos, restoreRepos } from "@bundle-grep/core";
 *
 * const layout = { archiveDir: "archive", cacheDir: "cache" };
 * const { unrestored } = (await loadArchivedRepos(layout)).unwrap();
 * for await (const event of restoreRepos(unrestored, layout)) console.log(event.type, event.entry.name);
 * ```
 */
export async function loadArchivedRepos(layout: ArchiveLayout): Promise<Result<LoadedRepos, FileSystemError>> {
  return Result.gen(async function* () {
    const loaded: LoadedRepos = { repos: [], empty: [], unrestored: [], invalid: [] }
    for (const entry of yield* Result.await(listArchive(layout))) {
      const metadata = await readMetadata(entry.paths.metadata)
      if (metadata.isErr()) {
        loaded.invalid.push(metadata.error)
      } else if (metadata.value?.head === null) {
        loaded.empty.push(entry)
      } else if (!existsSync(join(entry.paths.gitDir, 'HEAD'))) {
        loaded.unrestored.push(entry)
      } else {
        loaded.repos.push({ name: `${entry.owner}/${entry.name}`, gitDir: entry.paths.gitDir, entry, metadata: metadata.value })
      }
    }
    return Result.ok(loaded)
  })
}
