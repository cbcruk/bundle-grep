/**
 * Props for the repository list.
 *
 * @module
 */

import type { ApiResult, RepoList, Settings } from '../../api/api.types'

/** Props for {@linkcode ReposView}. */
export interface ReposViewProps {
  /** The query to go back to. */
  query: string
  /** The archive's repositories, or why they could not be listed. */
  repos: ApiResult<RepoList>
  /** Where the archive lives. */
  settings: Settings
  /** Called after a sync or restore, so the list can be loaded again. */
  onChanged: () => Promise<void>
}
