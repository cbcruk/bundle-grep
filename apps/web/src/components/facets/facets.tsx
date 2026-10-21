import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useState } from 'react'

import { hasFacet, toggleFacet } from '../../lib/query-edit'
import { routeHref } from '../../lib/route'
import type { FacetGroupProps, FacetsProps } from './facets.types'
import { facetLabel } from './facets.utils'

/** Entries a facet shows before "Show more". */
const COLLAPSED = 8

function FacetGroup({ title, kind, query, counts }: FacetGroupProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const entries = Object.entries(counts).toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (entries.length === 0) return null
  const shown = expanded ? entries : entries.slice(0, COLLAPSED)
  return (
    <VStack gap={1}>
      <List header={<Heading level={3}>{title}</Heading>} density="compact" edgeCompensation="inline">
        {shown.map(([value, count]) => {
          const facet = { kind, value }
          return (
            <ListItem
              key={value}
              label={facetLabel(facet)}
              href={routeHref({ view: 'search', q: toggleFacet(query, facet) })}
              isSelected={hasFacet(query, facet)}
              endContent={
                <Text type="supporting" hasTabularNumbers>
                  {count}
                </Text>
              }
            />
          )
        })}
      </List>
      {entries.length > COLLAPSED && (
        <HStack>
          <Button
            label={expanded ? 'Show less' : `Show ${entries.length - COLLAPSED} more`}
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          />
        </HStack>
      )}
    </VStack>
  )
}

/** The filters: matching files per language, repository, and top-level directory, each a filter to toggle. */
export function Facets({ query, facets }: FacetsProps): React.JSX.Element {
  if (!facets) return <Text color="secondary">Filters appear when the search finishes.</Text>
  return (
    <VStack gap={6}>
      <FacetGroup title="Languages" kind="language" query={query} counts={facets.languages} />
      <FacetGroup title="Repositories" kind="repo" query={query} counts={facets.repos} />
      <FacetGroup title="Paths" kind="path" query={query} counts={facets.paths} />
    </VStack>
  )
}
