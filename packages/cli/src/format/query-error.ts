/**
 * Points at the part of a query that failed to parse or compile.
 *
 * @module
 */

import type { Span } from '@bundle-grep/core'

import { printable } from './ansi'
import type { Styles } from './format.types'

/**
 * Formats a query error as the message, the query, and a caret line under the span.
 *
 * The caret is aligned by terminal width, so wide characters such as Hangul
 * count twice. An empty span, such as the end of the query, still gets one
 * caret.
 *
 * @example Pointing at an unknown language
 * ```ts
 * import { stylesFor } from "./ansi";
 * import { formatQueryError } from "./query-error";
 *
 * formatQueryError("x language:nope", { message: 'Unknown language "nope"', span: { offset: 2, length: 13 } }, stylesFor(false));
 * ```
 *
 * The result is `error: Unknown language "nope"\n  x language:nope\n    ^^^^^^^^^^^^^\n`.
 */
export function formatQueryError(query: string, error: { message: string; span: Span }, styles: Styles): string {
  const { offset, length } = error.span
  const before = Bun.stringWidth(query.slice(0, offset))
  const width = Bun.stringWidth(query.slice(offset, offset + length))
  const caret = `${' '.repeat(before)}${'^'.repeat(Math.max(1, width))}`
  return `${styles.red('error:')} ${error.message}\n  ${printable(query)}\n  ${styles.red(caret)}\n`
}
