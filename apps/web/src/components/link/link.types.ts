/**
 * Props for in-app links.
 *
 * @module
 */

import type { LinkProps as AstryxLinkProps } from '@astryxdesign/core/Link'
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
  /** The text color; the accent color unless set. */
  color?: AstryxLinkProps['color']
  /** The font size; the surrounding text's unless set. */
  size?: AstryxLinkProps['size']
  /** The font weight. */
  weight?: AstryxLinkProps['weight']
  /** Sizes a link that stands on its own rather than inside a sentence. */
  isStandalone?: boolean
  /** The link's contents. */
  children: ReactNode
}
