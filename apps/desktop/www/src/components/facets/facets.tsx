import { useState } from 'react'

import { hasFacet, toggleFacet } from '../../lib/query-edit'
import type { Facet } from '../../lib/query-edit.types'
import { Link } from '../link/link'
import './facets.css'
import type { FacetGroupProps, FacetsProps } from './facets.types'

/** Entries a facet shows before "Show more". */
const COLLAPSED = 8

function label(facet: Facet): string {
  return facet.kind === 'path' && facet.value === '' ? '(root)' : facet.value
}

function FacetGroup({ title, kind, query, counts }: FacetGroupProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const entries = Object.entries(counts).toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (entries.length === 0) return null
  const shown = expanded ? entries : entries.slice(0, COLLAPSED)
  return (
    <section className="facet-group">
      <h3>{title}</h3>
      <ul>
        {shown.map(([value, count]) => {
          const facet = { kind, value }
          const selected = hasFacet(query, facet)
          return (
            <li key={value}>
              <Link
                to={{ view: 'search', q: toggleFacet(query, facet) }}
                className={selected ? 'facet selected' : 'facet'}
                title={selected ? 'Remove this filter' : 'Filter to this'}
              >
                <span className="facet-name">{label(facet)}</span>
                <span className="facet-count">{count}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      {entries.length > COLLAPSED && (
        <button type="button" className="facet-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : `Show ${entries.length - COLLAPSED} more`}
        </button>
      )}
    </section>
  )
}

/** The sidebar: matching files per language, repository, and top-level directory, each a filter to toggle. */
export function Facets({ query, facets }: FacetsProps): React.JSX.Element {
  return (
    <aside className="facets" aria-label="Filters">
      {facets ? (
        <>
          <FacetGroup title="Languages" kind="language" query={query} counts={facets.languages} />
          <FacetGroup title="Repositories" kind="repo" query={query} counts={facets.repos} />
          <FacetGroup title="Paths" kind="path" query={query} counts={facets.paths} />
        </>
      ) : (
        <p className="facets-pending">Filters appear when the search finishes.</p>
      )}
    </aside>
  )
}
