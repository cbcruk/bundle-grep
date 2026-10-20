/**
 * Types for restoring search caches from bundles.
 *
 * @module
 */

import type { ArchiveMismatchError, FileSystemError, InvalidRepoNameError, RepoLockedError } from '../archive/archive.errors'
import type { ArchiveEntry, ArchiveLayout, ArchivePaths } from '../archive/archive.types'
import type { GitError } from '../git/git.errors'

/** Options for {@linkcode restoreRepo} and {@linkcode restoreRepos}. */
export interface RestoreOptions extends ArchiveLayout {
  /** Stops the restore, killing any git still running. */
  signal?: AbortSignal
}

/**
 * What restoring one repository did.
 *
 * - `created`: there was no cache, and now there is one.
 * - `updated`: the cache differed from the bundle, and now matches it.
 * - `unchanged`: the cache already matched the bundle.
 * - `empty`: the repository has no branches, so there is nothing to search; any cache of it was removed.
 */
export type RestoreStatus = 'created' | 'updated' | 'unchanged' | 'empty'

/** The result of restoring one repository. */
export interface RestoreOutcome {
  /** What restoring did. */
  status: RestoreStatus
  /** Where the repository's files are; `gitDir` is ready to search unless the status is `empty`. */
  paths: ArchivePaths
  /** The branch `HEAD` points to, or `null` for an empty repository. */
  defaultBranch: string | null
  /** The commit `HEAD` resolves to, or `null` for an empty repository. */
  head: string | null
}

/** The ways restoring one repository can fail. */
export type RestoreError = GitError | FileSystemError | InvalidRepoNameError | ArchiveMismatchError | RepoLockedError

/** One step of {@linkcode restoreRepos}: a repository that was restored, or one that failed. */
export type RestoreEvent =
  | { type: 'restored'; entry: ArchiveEntry; outcome: RestoreOutcome }
  | { type: 'failed'; entry: ArchiveEntry; error: RestoreError }
