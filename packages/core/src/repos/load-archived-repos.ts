/**
 * Loads the archived repositories a search can run over.
 *
 * @module
 */

import { Result } from 'better-result'
import { existsSync } from 'node:fs'

import { FileSystemError } from '../archive/archive.errors'
import type { ArchiveEntry, ArchiveLayout } from '../archive/archive.types'
import { listArchive } from '../archive/list-archive'
import { readMetadata } from '../archive/metadata'
import { runGit } from '../git/run-git'
import type { LoadedRepos } from './repos.types'

async function hasCommit(entry: ArchiveEntry): Promise<boolean> {
  if (!existsSync(entry.paths.gitDir)) return false
  const resolved = await runGit([`--git-dir=${entry.paths.gitDir}`, 'rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], {
    cwd: entry.paths.gitDir,
    allowExitCodes: [1],
  })
  return resolved.isOk() && resolved.value.exitCode === 0
}

/**
 * Lists an archive's repositories with their metadata, sorted into those
 * ready to search and those that are not.
 *
 * A repository is ready once {@linkcode restoreRepo} has built a cache whose
 * `HEAD` resolves to a commit; a cache left half-built is unrestored. One
 * whose metadata says it was empty has nothing to search. One whose metadata
 * cannot be read, or that has neither a bundle nor a cache, is reported as
 * invalid rather than failing the whole archive. A bundle without metadata is
 * still searched, with what {@linkcode repoHolds} assumes about it.
 *
 * A cache is not compared with its bundle here, so one restored from an older
 * bundle is searched as it is; run {@linkcode restoreRepos} to bring it up to
 * date.
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
      } else if (await hasCommit(entry)) {
        loaded.repos.push({ name: `${entry.owner}/${entry.name}`, gitDir: entry.paths.gitDir, entry, metadata: metadata.value })
      } else if (existsSync(entry.paths.bundle)) {
        loaded.unrestored.push(entry)
      } else {
        const path = entry.paths.bundle
        loaded.invalid.push(new FileSystemError({ path, message: `${path} is missing, so there is nothing to restore` }))
      }
    }
    return Result.ok(loaded)
  })
}
