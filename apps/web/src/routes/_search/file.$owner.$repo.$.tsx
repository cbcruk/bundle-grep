import { createFileRoute } from '@tanstack/react-router'
import { use, useMemo } from 'react'

import { FileView } from '../../components/file-view/file-view'
import { getFile } from '../../functions/blob.functions'
import { routeHighlights } from '../../lib/result-route'
import { fileRouteOf, validateFileSearch } from '../../lib/route'
import { SearchContext } from '../../lib/search-context'

/** One file, at `HEAD` or the commit the address names, with the search's matches in it highlighted. */
export const Route = createFileRoute('/_search/file/$owner/$repo/$')({
  validateSearch: validateFileSearch,
  loaderDeps: ({ search }) => ({ ref: search.ref }),
  loader: ({ params, deps, abortController }) =>
    getFile({
      data: { repo: `${params.owner}/${params.repo}`, path: params._splat ?? '', ...(deps.ref ? { ref: deps.ref } : {}) },
      signal: abortController.signal,
    }),
  staleTime: Infinity,
  component: FileScreen,
})

function FileScreen(): React.JSX.Element {
  const params = Route.useParams()
  const search = Route.useSearch()
  const blob = Route.useLoaderData()
  const results = use(SearchContext)
  const route = useMemo(() => fileRouteOf(params, search), [params, search])
  const highlights = useMemo(() => routeHighlights(route, results.files, results.commits), [route, results.files, results.commits])
  return <FileView route={route} blob={blob} highlights={highlights} />
}
