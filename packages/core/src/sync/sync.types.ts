/**
 * Types for syncing repositories into the archive.
 *
 * @module
 */

import type { FileSystemError, InvalidRepoNameError, RepoLockedError } from '../archive/archive.errors'
import type { ArchiveLayout, ArchivePaths, RepoMetadata } from '../archive/archive.types'
import type { GitError } from '../git/git.errors'
import type { GhError } from '../github/github.errors'
import type { GithubOptions } from '../github/github.types'

/**
 * A repository to sync, with what its host reports about it.
 *
 * Fields the host did not report fall back to `false` or `null` in the
 * written {@linkcode RepoMetadata}.
 */
export interface SyncTarget {
  /** The account the repository belongs to; the first path segment in the archive. */
  owner: string
  /** The repository's name; the file name in the archive. */
  name: string
  /** Where to fetch from: any URL or path git accepts. */
  url: string
  /** Whether the repository is a fork. */
  isFork?: boolean
  /** Whether the repository is archived. */
  isArchived?: boolean
  /** Whether the repository is private. */
  isPrivate?: boolean
  /** The language the host reports for the repository. */
  primaryLanguage?: string | null
  /** The repository's description. */
  description?: string | null
  /** When the repository was last pushed to, as ISO 8601. */
  pushedAt?: string | null
}

/** Options for {@linkcode syncRepo} and {@linkcode syncRepos}. */
export interface SyncOptions extends ArchiveLayout {
  /** Stops the sync, killing any git still running. */
  signal?: AbortSignal
  /**
   * Extra environment for git, over the process's own; `undefined` unsets a
   * variable. `GIT_TERMINAL_PROMPT` is always `0`.
   */
  env?: Record<string, string | undefined>
  /** Returns the time recorded as {@linkcode RepoMetadata.syncedAt}; the current time by default. */
  now?: () => Date
}

/** Options for {@linkcode syncRepos}. */
export interface SyncReposOptions extends SyncOptions {
  /** How many repositories to sync at once; {@linkcode DEFAULT_SYNC_CONCURRENCY} by default. */
  concurrency?: number
}

/**
 * What syncing one repository did.
 *
 * - `created`: the repository had no bundle, and now has one.
 * - `updated`: its refs had changed, so the bundle was rebuilt.
 * - `unchanged`: its refs had not changed, so only the metadata was rewritten.
 * - `empty`: it has no commits, so there is nothing to bundle; only metadata was written.
 */
export type SyncStatus = 'created' | 'updated' | 'unchanged' | 'empty'

/** The result of syncing one repository. */
export interface SyncOutcome {
  /** What syncing did. */
  status: SyncStatus
  /** Where the repository's files are. */
  paths: ArchivePaths
  /** The metadata that was written. */
  metadata: RepoMetadata
}

/** The ways syncing one repository can fail. */
export type SyncError = GitError | FileSystemError | InvalidRepoNameError | RepoLockedError

/** One step of {@linkcode syncRepos}: a repository that synced, or one that failed. */
export type SyncEvent =
  | { type: 'synced'; target: SyncTarget; outcome: SyncOutcome }
  | { type: 'failed'; target: SyncTarget; error: SyncError }

/** Why a sync source could not be turned into repositories. */
export type SourceError = GhError | InvalidRepoNameError

/** What {@linkcode resolveSyncSource} found for one source. */
export interface ResolvedSource {
  /** The repositories to sync. */
  targets: SyncTarget[]
  /** Something worth telling the user, even though the source resolved. */
  warning?: string
}

/** Options for {@linkcode resolveSyncSource}. */
export interface ResolveSyncSourceOptions extends GithubOptions {
  /** Most repositories an owner may have; listing fails beyond it. 1000 by default. */
  limit?: number
}
