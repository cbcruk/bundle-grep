/**
 * Props for the file view.
 *
 * @module
 */

import type { SearchLine } from '@bundle-grep/core'

import type { Route } from '../../lib/route.types'

/** Props for {@linkcode FileView}. */
export interface FileViewProps {
  /** The file to show. */
  route: Extract<Route, { view: 'file' }>
  /** The lines the search matched in this file, to highlight; empty when it was opened some other way. */
  matches: readonly SearchLine[]
}
