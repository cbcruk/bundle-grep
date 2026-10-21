import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { useMemo, type ReactNode } from 'react'

import { AppShell } from '../components/app-shell/app-shell'
import { getArchiveIndex } from '../functions/archive.functions'
import { validateQuerySearch } from '../lib/route'
import styles from '../styles.css?url'

/** The document, the header with the search box, and the repositories and names completion offers. */
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'light dark' },
      { title: 'bundle-grep' },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'icon', href: 'data:,' },
    ],
  }),
  loader: () => getArchiveIndex(),
  staleTime: Infinity,
  shellComponent: Document,
  component: Root,
  notFoundComponent: () => <p className="notice">Nothing is at this address.</p>,
  errorComponent: ({ error }) => <p className="notice danger">{error instanceof Error ? error.message : String(error)}</p>,
})

function Document({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function Root(): React.JSX.Element {
  const { repos, languages } = Route.useLoaderData()
  const query = useRouterState({ select: state => validateQuerySearch(state.location.search as Record<string, unknown>).q })
  const sources = useMemo(() => ({ repos: repos.ok ? repos.value.repos.map(repo => repo.name) : [], languages }), [repos, languages])
  return (
    <AppShell query={query} sources={sources}>
      <Outlet />
    </AppShell>
  )
}
