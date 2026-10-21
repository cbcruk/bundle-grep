/**
 * Folds search stream events into a {@linkcode SearchState}.
 *
 * @module
 */

import type { SearchStreamEvent } from '../api/api.types'
import { thrownError } from '../lib/wire-error'
import type { SearchState } from './use-search.types'

/** The state before a query is typed. */
export const IDLE: SearchState = { status: 'idle', files: [], commits: [], failures: [] }

/** The state a new search starts in. */
export const RUNNING: SearchState = { status: 'running', files: [], commits: [], failures: [] }

/** Adds one stream event to the state; an `error` event ends the search. */
export function applyEvent(state: SearchState, event: SearchStreamEvent): SearchState {
  switch (event.type) {
    case 'archive':
      return { ...state, archive: event }
    case 'file':
      return { ...state, files: [...state.files, event] }
    case 'commit':
      return { ...state, commits: [...state.commits, event] }
    case 'repo-error':
      return { ...state, failures: [...state.failures, event] }
    case 'done':
      return { ...state, done: event }
    case 'error':
      return { ...state, status: 'error', error: event.error }
  }
}

/**
 * Ends the search: `done` when the stream ended, or `error` with what the
 * stream threw, such as a dropped connection. A search that an `error` event
 * ended stays as it is.
 */
export function finishSearch(state: SearchState, failure?: unknown): SearchState {
  if (state.status === 'error') return state
  return failure === undefined ? { ...state, status: 'done' } : { ...state, status: 'error', error: thrownError(failure) }
}
