import { Link as AstryxLink } from '@astryxdesign/core/Link'
import type { MouseEvent } from 'react'

import { useGo } from '../../hooks/use-go'
import { routeHref } from '../../lib/route'
import { routesClick } from '../route-anchor/route-anchor.utils'
import type { LinkProps } from './link.types'

/**
 * A link to one of the app's routes, which changes it without reloading the page.
 *
 * A click with a modifier key, or with another button, is left to the
 * browser, so the link can still open in a new tab.
 */
export function Link({ to, replace, className, color, size, weight, isStandalone, children }: LinkProps): React.JSX.Element {
  const go = useGo()
  const href = routeHref(to)
  const onClick = (event: MouseEvent): void => {
    if (!routesClick(event, href)) return
    event.preventDefault()
    go(to, { replace })
  }
  return (
    <AstryxLink href={href} className={className} color={color} size={size} weight={weight} isStandalone={isStandalone} onClick={onClick}>
      {children}
    </AstryxLink>
  )
}
