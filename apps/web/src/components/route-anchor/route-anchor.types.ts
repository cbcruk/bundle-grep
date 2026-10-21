/**
 * Props for the anchor Astryx components render.
 *
 * @module
 */

import type { AnchorHTMLAttributes, Ref } from 'react'

/** Props for {@linkcode RouteAnchor}: what Astryx passes to a link component. */
export interface RouteAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** The anchor element. */
  ref?: Ref<HTMLAnchorElement>
  /** The destination again, for routers that read `to`; the anchor uses `href` and leaves this off the element. */
  to?: unknown
}
