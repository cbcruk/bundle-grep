/**
 * Types used by more than one part of a command.
 *
 * @module
 */

import type { GhError, InvalidRepoNameError, RepoMetadata, SyncTarget } from '@bundle-grep/core'

/** Why a `sync` source could not be turned into repositories. */
export type TargetError = GhError | InvalidRepoNameError

/** What {@linkcode targetsFor} found for one `sync` source. */
export interface Resolved {
  /** The repositories to sync. */
  targets: SyncTarget[]
  /** Something worth telling the user, even though the source resolved. */
  warning?: string
}

/** Whether a listed repository can be searched. */
export type ListState = 'ready' | 'unrestored' | 'empty'

/** One repository as `list` shows it. */
export interface ListRow {
  /** `owner/name`. */
  name: string
  /** Whether it can be searched. */
  state: ListState
  /** What was recorded when it was synced, or `null` for a bundle without metadata. */
  metadata: RepoMetadata | null
}
