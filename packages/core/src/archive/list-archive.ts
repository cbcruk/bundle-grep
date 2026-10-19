/**
 * Finds the repositories kept in an archive directory.
 *
 * @module
 */

import { Result } from 'better-result'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { archivePaths } from './archive-paths'
import type { FileSystemError } from './archive.errors'
import type { ArchiveEntry, ArchiveLayout } from './archive.types'
import { fileSystem } from './file-system'

const ARCHIVED_FILE = /^(.+)\.(bundle|json)$/

async function entriesOf(path: string): Promise<Result<string[], FileSystemError>> {
  if (!existsSync(path)) return Result.ok([])
  const entries = await fileSystem(path, () => readdir(path, { withFileTypes: true }))
  return entries.map(found => found.filter(entry => entry.isDirectory() || entry.isFile()).map(entry => entry.name))
}

/**
 * Lists the repositories in an archive, as every `<owner>/<name>.bundle` or `<owner>/<name>.json`.
 *
 * A repository with only metadata is listed too: it was empty when synced.
 * Names that {@linkcode archivePaths} would reject, such as temporary files,
 * are skipped. A missing archive directory holds no repositories.
 *
 * @returns The repositories sorted by owner and name, or a
 * {@linkcode FileSystemError} when a directory cannot be read.
 *
 * @example Restoring every archived repository
 * ```ts
 * import { listArchive, restoreRepos } from "@bundle-grep/core";
 *
 * const layout = { archiveDir: "archive", cacheDir: "cache" };
 * const entries = (await listArchive(layout)).unwrap();
 * for await (const event of restoreRepos(entries, layout)) {
 *   console.log(event.type === "restored" ? event.outcome.status : event.error.message, event.entry.name);
 * }
 * ```
 */
export async function listArchive(layout: ArchiveLayout): Promise<Result<ArchiveEntry[], FileSystemError>> {
  return Result.gen(async function* () {
    const found = new Map<string, ArchiveEntry>()
    for (const owner of (yield* Result.await(entriesOf(layout.archiveDir))).sort()) {
      for (const file of yield* Result.await(entriesOf(join(layout.archiveDir, owner)))) {
        const name = ARCHIVED_FILE.exec(file)?.[1]
        if (name === undefined) continue
        const paths = archivePaths(layout, owner, name)
        if (paths.isOk()) found.set(`${owner}/${name}`, { owner, name, paths: paths.value })
      }
    }
    return Result.ok([...found.values()].sort((a, b) => (a.owner === b.owner ? cmp(a.name, b.name) : cmp(a.owner, b.owner))))
  })
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
