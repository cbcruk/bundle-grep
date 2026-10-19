/**
 * Decides which key presses are shortcuts.
 *
 * @module
 */

/**
 * Says whether a key press belongs to whatever has focus rather than to the
 * page: typing in a field, or pressed with a modifier.
 */
export function isTyping(event: {
  target: EventTarget | null
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return true
  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null
  return target?.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
}

/**
 * Says whether a key press is free for a page-wide shortcut: no modifier, and
 * nothing focused that would act on the key itself, such as a field, link,
 * or button.
 */
export function isPageKey(event: {
  target: EventTarget | null
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): boolean {
  if (isTyping(event)) return false
  const target = event.target as { tagName?: string } | null
  return target === null || ['BODY', 'HTML', undefined].includes(target.tagName)
}
