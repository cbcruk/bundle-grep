/**
 * Folds search stream events into a {@linkcode SearchState}.
 *
 * @module
 */

import type { ApiResult, SearchStreamEvent } from '../api/api.types'
import type { SearchState } from './use-search.types'

/** The state before a query is typed. */
export const IDLE: SearchState = { status: 'idle', files: [], commits: [], failures: [] }

/** The state a new search starts in. */
export const RUNNING: SearchState = { status: 'running', files: [], commits: [], failures: [] }

/** Adds one stream event to the state. */
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
    case 'heartbeat':
      return state
  }
}

/** Ends the search with how the stream ended. */
export function finishSearch(state: SearchState, result: ApiResult<void>): SearchState {
  return result.ok ? { ...state, status: 'done' } : { ...state, status: 'error', error: result.error }
}
