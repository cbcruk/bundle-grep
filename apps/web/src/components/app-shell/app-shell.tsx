import { useEffect, useRef } from 'react'

import { useGo } from '../../hooks/use-go'
import { isTyping } from '../../lib/keyboard'
import { Link } from '../link/link'
import { SearchBox } from '../search-box/search-box'
import type { AppShellProps } from './app-shell.types'
import './app-shell.css'

/** The header with the search box, above the screen. `/` focuses the search box from anywhere. */
export function AppShell({ query, sources, children }: AppShellProps): React.JSX.Element {
  const go = useGo()
  const input = useRef<HTMLInputElement>(null)

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

  return (
    <div className="app">
      <header className="app-header">
        <Link to={{ view: 'search', q: '' }} className="app-brand">
          bundle-grep
        </Link>
        <SearchBox query={query} sources={sources} inputRef={input} onSearch={q => go({ view: 'search', q })} />
        <Link to={{ view: 'repos', q: query }} className="app-nav">
          Repositories
        </Link>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
