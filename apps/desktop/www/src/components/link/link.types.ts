/**
 * Props for in-app links.
 *
 * @module
 */

import type { ReactNode } from 'react'

import type { Route } from '../../lib/route.types'

/** Props for {@linkcode Link}. */
export interface LinkProps {
  /** Where the link goes. */
  to: Route
  /** Replaces the current history entry instead of adding one. */
  replace?: boolean
  /** Class names for the anchor. */
  className?: string
  /** Shown as the anchor's tooltip. */
  title?: string
  /** The link's contents. */
  children: ReactNode
}
