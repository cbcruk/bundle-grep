import { useEffect, useMemo, useRef, useState } from 'react'

import { FileView } from '../components/file-view/file-view'
import { Facets } from '../components/facets/facets'
import { Link } from '../components/link/link'
import { Results } from '../components/results/results'
import { ReposView } from '../components/repos-view/repos-view'
import { SearchBox } from '../components/search-box/search-box'
import { useArchive, useLanguages } from '../hooks/use-archive'
import { navigate, useRoute } from '../hooks/use-route'
import { useSearch } from '../hooks/use-search'
import { isTyping } from '../lib/keyboard'
import './app.css'

/** Files a search asks for at first. */
const LIMIT = 100

/** Files "Show more" asks for: the most the server sends. */
const MAX_LIMIT = 1000

/**
 * The whole page: the header with the search box, and the screen the address
 * names. `/` focuses the search box from anywhere.
 *
 * The search keeps running while a file is open, so going back shows the
 * same results without searching again.
 */
export function App(): React.JSX.Element {
  const route = useRoute()
  const { repos, reload } = useArchive()
  const languages = useLanguages()
  const [limit, setLimit] = useState(LIMIT)
  const search = useSearch(route.q, limit)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => setLimit(LIMIT), [route.q])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== '/' || isTyping(event)) return
      event.preventDefault()
      input.current?.focus()
      input.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return (): void => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const sources = useMemo(
    () => ({ repos: repos?.ok ? repos.value.repos.map(repo => repo.name) : [], languages }),
    [repos, languages],
  )

  const matches = useMemo(() => {
    if (route.view !== 'file') return []
    return search.files.find(file => file.repo === route.repo && file.path === route.path)?.lines ?? []
  }, [route, search.files])

  return (
    <div className="app">
      <header className="app-header">
        <Link to={{ view: 'search', q: '' }} className="app-brand">
          bundle-grep
        </Link>
        <SearchBox query={route.q} sources={sources} inputRef={input} onSearch={q => navigate({ view: 'search', q })} />
        <Link to={{ view: 'repos', q: route.q }} className="app-nav">
          Repositories
        </Link>
      </header>
      <main className="app-main">
        {route.view === 'repos' && <ReposView query={route.q} repos={repos} onChanged={reload} />}
        {route.view === 'file' && <FileView route={route} matches={matches} />}
        {route.view === 'search' &&
          (route.q === '' ? (
            <Start />
          ) : (
            <div className="app-search">
              {search.status !== 'error' && <Facets query={route.q} facets={search.done?.facets} />}
              <Results
                query={route.q}
                search={search}
                limit={limit}
                maxLimit={MAX_LIMIT}
                onShowMore={() => setLimit(MAX_LIMIT)}
              />
            </div>
          ))}
      </main>
    </div>
  )
}

function Start(): React.JSX.Element {
  return (
    <div className="app-start">
      <h1>Search your archive</h1>
      <p>
        Queries follow GitHub code search: <code>useState language:typescript</code>, <code>repo:owner/name</code>,{' '}
        <code>path:/src/**</code>, <code>/regex/</code>, <code>"exact phrase"</code>, <code>NOT</code>, <code>OR</code>.
      </p>
      <p>
        Press <kbd>/</kbd> to search, <kbd>j</kbd>/<kbd>k</kbd> to move between results, <kbd>Enter</kbd> to open one,
        and <kbd>Esc</kbd> to go back.
      </p>
    </div>
  )
}
