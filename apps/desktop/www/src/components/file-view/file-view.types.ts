/**
 * Props for the file view.
 *
 * @module
 */

import type { MatchRange } from '@bundle-grep/core'

import type { Route } from '../../lib/route.types'

/** Props for {@linkcode FileView}. */
export interface FileViewProps {
  /** The file to show. */
  route: Extract<Route, { view: 'file' }>
  /** What the search matched in this file, by line number; empty when it was opened some other way. */
  highlights: ReadonlyMap<number, readonly MatchRange[]>
}
