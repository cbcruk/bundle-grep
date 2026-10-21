import type { MouseEvent } from 'react'

import { useGo } from '../../hooks/use-go'
import { routeHref } from '../../lib/route'
import type { LinkProps } from './link.types'

/**
 * An anchor that changes the route without reloading the page.
 *
 * A click with a modifier key, or with another button, is left to the
 * browser, so the link can still open in a new tab.
 */
export function Link({ to, replace, className, title, children }: LinkProps): React.JSX.Element {
  const go = useGo()
  const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    go(to, { replace })
  }
  return (
    <a href={routeHref(to)} className={className} title={title} onClick={onClick}>
      {children}
    </a>
  )
}
