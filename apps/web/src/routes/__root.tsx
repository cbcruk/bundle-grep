import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import { Banner } from '@astryxdesign/core/Banner'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Theme } from '@astryxdesign/core/theme'
import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { useMemo, type ReactNode } from 'react'

import { defaultThemeSlug, themes } from '../astryx-themes'
import { AppShell } from '../components/app-shell/app-shell'
import { RouteAnchor } from '../components/route-anchor/route-anchor'
import { getArchiveIndex } from '../functions/archive.functions'
import { validateQuerySearch } from '../lib/route'

/** The document, the header with the search box, and the repositories and names completion offers. */
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'light dark' },
      { title: 'bundle-grep' },
    ],
    links: [{ rel: 'icon', href: 'data:,' }],
  }),
  loader: () => getArchiveIndex(),
  staleTime: Infinity,
  shellComponent: Document,
  component: Root,
  notFoundComponent: () => <Banner status="warning" title="Nothing is at this address." />,
  errorComponent: ({ error }) => <Banner status="error" title={error instanceof Error ? error.message : String(error)} />,
})

function Document({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Theme theme={themes[defaultThemeSlug]}>
          <LinkProvider component={RouteAnchor}>{children}</LinkProvider>
        </Theme>
        <Scripts />
      </body>
    </html>
  )
}

function Root(): React.JSX.Element {
  const { repos, languages } = Route.useLoaderData()
  const search = useRouterState({ select: state => state.location.search as Record<string, unknown> })
  const section = useRouterState({ select: state => (state.location.pathname === '/repos' ? 'repos' : 'search') })
  const from = useMemo(() => validateQuerySearch(search), [search])
  const sources = useMemo(() => ({ repos: repos.ok ? repos.value.repos.map(repo => repo.name) : [], languages }), [repos, languages])
  return (
    <AppShell from={from} section={section} sources={sources}>
      <Outlet />
    </AppShell>
  )
}
