/**
 * Decides which link clicks the app routes itself.
 *
 * @module
 */

/**
 * Says whether a click on a link should change the route in the page rather
 * than be left to the browser.
 *
 * The browser keeps a click another handler already took, one with a
 * modifier key or another button, and one on a link without an address or
 * that opens elsewhere.
 *
 * @example
 * ```ts
 * import { routesClick } from "./route-anchor.utils";
 *
 * const plain = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
 * routesClick(plain, "/repos"); // true
 * routesClick({ ...plain, metaKey: true }, "/repos"); // false: opens a new tab
 * ```
 */
export function routesClick(
  event: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  href: string | undefined,
  target?: string,
): boolean {
  if (event.defaultPrevented || !href || (target && target !== '_self')) return false
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
