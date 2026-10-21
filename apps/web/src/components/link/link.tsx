import { Link as AstryxLink } from '@astryxdesign/core/Link'
import type { MouseEvent } from 'react'

import { useGo } from '../../hooks/use-go'
import { routeHref } from '../../lib/route'
import type { LinkProps } from './link.types'

/**
 * A link to one of the app's routes, which changes it without reloading the page.
 *
 * A click with a modifier key, or with another button, is left to the
 * browser, so the link can still open in a new tab.
 */
export function Link({ to, replace, className, color, size, weight, isStandalone, children }: LinkProps): React.JSX.Element {
  const go = useGo()
  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    go(to, { replace })
  }
  return (
    <AstryxLink href={routeHref(to)} className={className} color={color} size={size} weight={weight} isStandalone={isStandalone} onClick={onClick}>
      {children}
    </AstryxLink>
  )
}
