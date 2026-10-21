import { useRouter } from '@tanstack/react-router'
import type { MouseEvent } from 'react'

import type { RouteAnchorProps } from './route-anchor.types'

/**
 * The anchor every Astryx link renders, which changes the route without
 * reloading the page.
 *
 * A click another handler already took, with a modifier key or another
 * button, or on a link that opens elsewhere, is left to the browser.
 */
export function RouteAnchor({ onClick, to: _to, ...props }: RouteAnchorProps): React.JSX.Element {
  const router = useRouter()
  const click = (event: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(event)
    const { href, target } = props
    if (event.defaultPrevented || !href || (target && target !== '_self')) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void router.navigate({ href })
  }
  return <a {...props} onClick={click} />
}
