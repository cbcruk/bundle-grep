/**
 * Props for the repository list.
 *
 * @module
 */

import type { ApiResult, RepoList, RepoRow, Settings } from '../../api/api.types'
import type { QuerySearch } from '../../lib/route.types'

/** Props for {@linkcode ReposView}. */
export interface ReposViewProps {
  /** The search to go back to. */
  from: QuerySearch
  /** The archive's repositories, or why they could not be listed. */
  repos: ApiResult<RepoList>
  /** Where the archive lives. */
  settings: Settings
  /** Called after a sync or restore, so the list can be loaded again. */
  onChanged: () => Promise<void>
}

/** A {@linkcode RepoRow} as the repository table takes it. */
export type RepoTableRow = { [K in keyof RepoRow]: RepoRow[K] }

/** Props for the time cells of the repository table. */
export interface WhenProps {
  /** The time, or nothing when it is unknown. */
  iso: string | null | undefined
}
