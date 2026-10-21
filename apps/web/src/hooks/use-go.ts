/**
 * Navigates to {@linkcode Route}s.
 *
 * @module
 */

import { useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'

import { routeHref } from '../lib/route'
import type { Route } from '../lib/route.types'

/** A function that shows a route, adding a history entry unless `replace` is set. */
export function useGo(): (route: Route, options?: { replace?: boolean }) => void {
  const router = useRouter()
  return useCallback(
    (route, options = {}) => void router.navigate({ href: routeHref(route), replace: options.replace }),
    [router],
  )
}
