/**
 * Maps repositories to their files in the archive.
 *
 * @module
 */

import { Result } from 'better-result'
import { join, resolve } from 'node:path'

import { InvalidRepoNameError } from './archive.errors'
import type { ArchiveLayout, ArchivePaths } from './archive.types'

const SEGMENT = /^[A-Za-z0-9_.-]+$/

function checkSegment(name: string): Result<string, InvalidRepoNameError> {
  if (SEGMENT.test(name) && !/^\.+$/.test(name)) return Result.ok(name)
  return Result.err(
    new InvalidRepoNameError({
      value: name,
      message: `"${name}" is not a valid owner or repository name: use letters, digits, ".", "-" and "_"`,
    }),
  )
}

/**
 * Returns where a repository's bundle, metadata and bare repository live.
 *
 * The paths are absolute, since git resolves relative paths against the
 * directory it runs in rather than the caller's.
 *
 * @returns The paths, or an {@linkcode InvalidRepoNameError} when the owner or
 * name could escape its directory or is otherwise unusable as a file name.
 *
 * @example Locating a repository's files
 * ```ts
 * import { archivePaths } from "@bundle-grep/core";
 *
 * const paths = archivePaths({ archiveDir: "archive", cacheDir: "cache" }, "cbcruk", "barlo").unwrap();
 * paths.bundle;
 * ```
 *
 * `paths.bundle` ends in `archive/cbcruk/barlo.bundle`.
 */
export function archivePaths(
  layout: ArchiveLayout,
  owner: string,
  name: string,
): Result<ArchivePaths, InvalidRepoNameError> {
  return Result.gen(function* () {
    yield* checkSegment(owner)
    yield* checkSegment(name)
    const archive = resolve(layout.archiveDir, owner)
    return Result.ok({
      bundle: join(archive, `${name}.bundle`),
      metadata: join(archive, `${name}.json`),
      gitDir: resolve(layout.cacheDir, owner, `${name}.git`),
    })
  })
}
