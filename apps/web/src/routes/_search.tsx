import { Outlet, createFileRoute } from '@tanstack/react-router'

import { searchArchive } from '../functions/search.functions'
import { useSearch } from '../hooks/use-search'
import { isBlankQuery, validateQuerySearch } from '../lib/route'
import { SearchContext } from '../lib/search-context'
import { CONTEXT, LIMIT, MAX_LIMIT } from '../lib/search-limits'

/**
 * Runs the search for the address's query, for the results and for the file
 * opened from them, which highlights what the search found in it.
 *
 * The loader returns the search's stream without waiting for it: rendered
 * on the server, the results stream into the page as they are found. The
 * search keeps running while a file is open, so going back shows the same
 * results without searching again; leaving for another query or screen
 * stops it.
 */
export const Route = createFileRoute('/_search')({
  validateSearch: validateQuerySearch,
  loaderDeps: ({ search }) => ({ q: search.q, more: search.more }),
  loader: async ({ deps, abortController }) => {
    if (isBlankQuery(deps.q)) return { events: undefined }
    const data = { q: deps.q, limit: deps.more ? MAX_LIMIT : LIMIT, context: CONTEXT }
    return { events: await searchArchive({ data, signal: abortController.signal }) }
  },
  staleTime: Infinity,
  gcTime: 0,
  component: SearchLayout,
})

function SearchLayout(): React.JSX.Element {
  const { events } = Route.useLoaderData()
  const search = useSearch(events)
  return (
    <SearchContext value={search}>
      <Outlet />
    </SearchContext>
  )
}
