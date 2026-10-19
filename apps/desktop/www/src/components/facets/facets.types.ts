/**
 * Props for the sidebar facets.
 *
 * @module
 */

import type { SearchDone } from '../../hooks/use-search.types'
import type { Facet } from '../../lib/query-edit.types'

/** Props for {@linkcode Facets}. */
export interface FacetsProps {
  /** The query the counts are for. */
  query: string
  /** The finished search's facets, or `undefined` while it runs. */
  facets: SearchDone['facets'] | undefined
}

/** Props for one facet's list. */
export interface FacetGroupProps {
  /** The heading. */
  title: string
  /** Which qualifier its entries add. */
  kind: Facet['kind']
  /** The query the counts are for. */
  query: string
  /** Matching files per entry. */
  counts: Record<string, number>
}
