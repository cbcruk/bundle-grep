import { AppShell as AstryxAppShell } from '@astryxdesign/core/AppShell'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav'
import { useEffect, useRef } from 'react'

import { useGo } from '../../hooks/use-go'
import { isTyping } from '../../lib/keyboard'
import { routeHref } from '../../lib/route'
import { SearchBox } from '../search-box/search-box'
import type { AppShellProps } from './app-shell.types'

/**
 * The top bar with the search box, above the screen. `/` focuses the search box from anywhere.
 *
 * Wider than 768px the search box sits centered between the name and the
 * navigation; narrower, the name gives way and the search box takes its place.
 */
export function AppShell({ from, section, sources, children }: AppShellProps): React.JSX.Element {
  const go = useGo()
  const input = useRef<HTMLInputElement>(null)
  const narrow = useMediaQuery('(max-width: 768px)')

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

  const searchBox = (
    <SearchBox query={from.q} sources={sources} inputRef={input} onSearch={q => go({ view: 'search', q })} />
  )

  return (
    <AstryxAppShell
      mobileNav={false}
      topNav={
        <TopNav
          heading={narrow ? undefined : <TopNavHeading heading="bundle-grep" headingHref={routeHref({ view: 'search', q: '' })} />}
          startContent={narrow ? searchBox : undefined}
          centerContent={narrow ? undefined : searchBox}
          endContent={
            <TopNavItem label="Repositories" href={routeHref({ view: 'repos', ...from })} isSelected={section === 'repos'} />
          }
        />
      }
    >
      {children}
    </AstryxAppShell>
  )
}
