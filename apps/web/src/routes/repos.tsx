import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'

import { ReposView } from '../components/repos-view/repos-view'
import { getSettings } from '../functions/archive.functions'
import { validateQuerySearch } from '../lib/route'

const root = getRouteApi('__root__')

/** The archive: every repository, sync, and restore. */
export const Route = createFileRoute('/repos')({
  validateSearch: (raw: Record<string, unknown>) => ({ q: validateQuerySearch(raw).q }),
  loader: () => getSettings(),
  staleTime: Infinity,
  component: ReposScreen,
})

function ReposScreen(): React.JSX.Element {
  const { q } = Route.useSearch()
  const settings = Route.useLoaderData()
  const { repos } = root.useLoaderData()
  const router = useRouter()
  return <ReposView query={q} repos={repos} settings={settings} onChanged={() => router.invalidate()} />
}
