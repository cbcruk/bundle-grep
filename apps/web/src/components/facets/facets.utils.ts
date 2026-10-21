/**
 * Labels for sidebar facets.
 *
 * @module
 */

import type { Facet } from '../../lib/query-edit.types'

/** Names a facet entry, with `(root)` for files outside any directory. */
export function facetLabel(facet: Facet): string {
  return facet.kind === 'path' && facet.value === '' ? '(root)' : facet.value
}
