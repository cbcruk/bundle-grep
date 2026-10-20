/**
 * Types for loading the archive's repositories.
 *
 * @module
 */

import type { ApiResult } from '../api/api.types'
import type { RepoList } from '../../../src/desktop.types'

/** The archive as {@linkcode useArchive} loads it. */
export interface ArchiveState {
  /** The repositories, or `undefined` while loading. */
  repos: ApiResult<RepoList> | undefined
  /** Loads them again, as after a sync. */
  reload: () => void
}
