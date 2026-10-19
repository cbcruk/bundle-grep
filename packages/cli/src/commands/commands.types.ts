/**
 * Types used by more than one part of a command.
 *
 * @module
 */

import type { RepoMetadata } from '@bundle-grep/core'

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
