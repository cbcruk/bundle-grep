/**
 * Props for the file view.
 *
 * @module
 */

import type { MatchRange } from '@bundle-grep/core'

import type { ApiResult, BlobContent } from '../../api/api.types'
import type { FileRoute } from '../../lib/route.types'

/** Props for {@linkcode FileView}. */
export interface FileViewProps {
  /** The file to show. */
  route: FileRoute
  /** The file's contents, or why they could not be read. */
  blob: ApiResult<BlobContent>
  /** What the search matched in this file, by line number; empty when it was opened some other way. */
  highlights: ReadonlyMap<number, readonly MatchRange[]>
}
