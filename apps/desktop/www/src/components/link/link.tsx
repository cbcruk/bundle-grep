import type { MouseEvent } from 'react'

import { navigate, routeHref } from '../../hooks/use-route'
import type { LinkProps } from './link.types'

/** An anchor that changes the route without reloading the page. */
export function Link({ to, replace, className, title, children }: LinkProps): React.JSX.Element {
  const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    navigate(to, { replace })
  }
  return (
    <a href={routeHref(to)} className={className} title={title} onClick={onClick}>
      {children}
    </a>
  )
}
