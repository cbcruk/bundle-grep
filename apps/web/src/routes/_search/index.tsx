import { Collapsible } from '@astryxdesign/core/Collapsible'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Layout, LayoutContent, LayoutPanel } from '@astryxdesign/core/Layout'
import { VStack } from '@astryxdesign/core/Stack'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { use } from 'react'

import { Facets } from '../../components/facets/facets'
import { Results } from '../../components/results/results'
import { StartPage } from '../../components/start-page/start-page'
import { useGo } from '../../hooks/use-go'
import { isBlankQuery } from '../../lib/route'
import { SearchContext } from '../../lib/search-context'
import { LIMIT, MAX_LIMIT } from '../../lib/search-limits'

const root = getRouteApi('__root__')

/**
 * The results of the address's query, with its facets; the start page with no query.
 *
 * Wider than 768px the facets sit in a panel beside the results; narrower,
 * they fold into a collapsed section above them.
 */
export const Route = createFileRoute('/_search/')({ component: SearchScreen })

function SearchScreen(): React.JSX.Element {
  const { q, more } = Route.useSearch()
  const search = use(SearchContext)
  const { symbolLanguages } = root.useLoaderData()
  const go = useGo()
  const narrow = useMediaQuery('(max-width: 768px)')
  if (isBlankQuery(q)) return <StartPage />
  const facets = search.status !== 'error' && <Facets query={q} facets={search.done?.facets} />
  const results = (
    <Results
      query={q}
      more={more}
      search={search}
      limit={more ? MAX_LIMIT : LIMIT}
      maxLimit={MAX_LIMIT}
      onShowMore={() => go({ view: 'search', q, more: true }, { replace: true })}
      symbolLanguages={symbolLanguages}
    />
  )
  return (
    <Layout
      start={
        !narrow &&
        facets && (
          <LayoutPanel width={260} hasDivider role="complementary" label="Filters">
            {facets}
          </LayoutPanel>
        )
      }
      content={
        <LayoutContent>
          {narrow && facets ? (
            <VStack gap={4}>
              <Collapsible trigger="Filters" defaultIsOpen={false}>
                {facets}
              </Collapsible>
              {results}
            </VStack>
          ) : (
            results
          )}
        </LayoutContent>
      }
    />
  )
}
