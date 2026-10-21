import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { use } from 'react'

import { Facets } from '../../components/facets/facets'
import { Results } from '../../components/results/results'
import { StartPage } from '../../components/start-page/start-page'
import { useGo } from '../../hooks/use-go'
import { SearchContext } from '../../lib/search-context'
import { LIMIT, MAX_LIMIT } from '../../lib/search-limits'

const root = getRouteApi('__root__')

/** The results of the address's query, with its facets; the start page with no query. */
export const Route = createFileRoute('/_search/')({ component: SearchScreen })

function SearchScreen(): React.JSX.Element {
  const { q, more } = Route.useSearch()
  const search = use(SearchContext)
  const { symbolLanguages } = root.useLoaderData()
  const go = useGo()
  if (q === '') return <StartPage />
  return (
    <div className="app-search">
      {search.status !== 'error' && <Facets query={q} facets={search.done?.facets} />}
      <Results
        query={q}
        more={more}
        search={search}
        limit={more ? MAX_LIMIT : LIMIT}
        maxLimit={MAX_LIMIT}
        onShowMore={() => go({ view: 'search', q, more: true }, { replace: true })}
        symbolLanguages={symbolLanguages}
      />
    </div>
  )
}
