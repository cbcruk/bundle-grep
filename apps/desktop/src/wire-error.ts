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
 * Structured fields such as a `GitError`'s arguments are dropped; its
 * message, which quotes git's stderr, is kept.
 */
export function toWireError(error: { readonly _tag: string; readonly message: string; readonly span?: Span }): WireError {
  return { _tag: error._tag, message: error.message, ...(error.span ? { span: error.span } : {}) }
}
