/**
 * Props for the repository list.
 *
 * @module
 */

import type { ApiResult } from '../../api/api.types'
import type { RepoList } from '../../../../src/desktop.types'

/** Props for {@linkcode ReposView}. */
export interface ReposViewProps {
  /** The query to go back to. */
  query: string
  /** The archive's repositories, `undefined` while loading. */
  repos: ApiResult<RepoList> | undefined
  /** Called after a sync or restore, so the list can be loaded again. */
  onChanged: () => void
}
