/**
 * Turns failures into plain objects that survive JSON.
 *
 * @module
 */

import type { Span } from '@bundle-grep/core'

import type { WireError } from './desktop.types'

/**
 * Keeps a tagged error's tag, message, and query span, dropping the rest.
 *
 * Fields such as a `GitError`'s arguments and stderr stay on the server: the
 * message already says what went wrong.
 */
export function toWireError(error: { readonly _tag: string; readonly message: string; readonly span?: Span }): WireError {
  return { _tag: error._tag, message: error.message, ...(error.span ? { span: error.span } : {}) }
}
