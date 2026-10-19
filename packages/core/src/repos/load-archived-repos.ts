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
import type { Classified, LoadedRepos } from './repos.types'

const CONCURRENCY = 8

async function hasCommit(entry: ArchiveEntry): Promise<boolean> {
  if (!existsSync(entry.paths.gitDir)) return false
  const resolved = await runGit([`--git-dir=${entry.paths.gitDir}`, 'rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], {
    cwd: entry.paths.gitDir,
    allowExitCodes: [1],
  })
  return resolved.isOk() && resolved.value.exitCode === 0
}

async function classify(entry: ArchiveEntry): Promise<Classified> {
  const metadata = await readMetadata(entry.paths.metadata)
  if (metadata.isErr()) return { type: 'invalid', value: metadata.error }
  if (metadata.value?.head === null) return { type: 'empty', value: entry }
  if (await hasCommit(entry)) {
    return {
      type: 'repos',
      value: { name: `${entry.owner}/${entry.name}`, gitDir: entry.paths.gitDir, entry, metadata: metadata.value },
    }
  }
  if (existsSync(entry.paths.bundle)) return { type: 'unrestored', value: entry }
  const path = entry.paths.bundle
  return { type: 'invalid', value: new FileSystemError({ path, message: `${path} is missing, so there is nothing to restore` }) }
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
 * date. Entries are checked several at a time; the lists keep archive order.
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
    const entries = yield* Result.await(listArchive(layout))
    const kinds: Classified[] = []
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, entries.length) }, async () => {
        while (next < entries.length) {
          const index = next++
          kinds[index] = await classify(entries[index]!)
        }
      }),
    )
    const loaded: LoadedRepos = { repos: [], empty: [], unrestored: [], invalid: [] }
    for (const kind of kinds) {
      if (kind.type === 'repos') loaded.repos.push(kind.value)
      else if (kind.type === 'invalid') loaded.invalid.push(kind.value)
      else loaded[kind.type].push(kind.value)
    }
    return Result.ok(loaded)
  })
}
