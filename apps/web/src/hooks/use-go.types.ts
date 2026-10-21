/**
 * Types for navigating to routes.
 *
 * @module
 */

import type { Route } from '../lib/route.types'

/** Shows a route, adding a history entry unless `replace` is set. */
export type Go = (route: Route, options?: { replace?: boolean }) => void
