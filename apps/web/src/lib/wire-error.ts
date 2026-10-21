/**
 * Turns failures into plain objects the page can be sent.
 *
 * @module
 */

import type { Span } from '@bundle-grep/core'

import type { WireError } from '../api/api.types'

/**
 * Keeps a tagged error's tag, message, and query span, dropping the rest.
 *
 * Structured fields such as a `GitError`'s arguments are dropped; its
 * message, which quotes git's stderr, is kept.
 */
export function toWireError(error: { readonly _tag: string; readonly message: string; readonly span?: Span }): WireError {
  return { _tag: error._tag, message: error.message, ...(error.span ? { span: error.span } : {}) }
}

/** Describes anything thrown, such as a failed `fetch`, as a {@linkcode WireError}. */
export function thrownError(error: unknown): WireError {
  if (error instanceof DOMException && error.name === 'AbortError') return { _tag: 'AbortError', message: 'Cancelled' }
  if (error instanceof Error) return { _tag: '_tag' in error && typeof error._tag === 'string' ? error._tag : 'Error', message: error.message }
  return { _tag: 'Error', message: String(error) }
}
