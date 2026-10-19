/**
 * Keeps the current {@linkcode Route} in the address bar.
 *
 * @module
 */

import { useMemo, useSyncExternalStore } from 'react'

import { parseRoute, routeSearch } from '../lib/route'
import type { Route } from '../lib/route.types'

const NAVIGATED = 'bundle-grep:navigated'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange)
  window.addEventListener(NAVIGATED, onChange)
  return (): void => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(NAVIGATED, onChange)
  }
}

function snapshot(): string {
  return window.location.search
}

/** The route in the address bar, updated on {@linkcode navigate} and the back button. */
export function useRoute(): Route {
  const search = useSyncExternalStore(subscribe, snapshot)
  return useMemo(() => parseRoute(search), [search])
}

/** The `href` for a route, relative to the page. */
export function routeHref(route: Route): string {
  return `${window.location.pathname}${routeSearch(route)}`
}

/**
 * Shows a route, adding a history entry unless `replace` is set. Going to the
 * route already shown does nothing.
 */
export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const href = routeHref(route)
  if (href === `${window.location.pathname}${window.location.search}`) return
  if (options.replace) window.history.replaceState(null, '', href)
  else window.history.pushState(null, '', href)
  window.dispatchEvent(new Event(NAVIGATED))
}
