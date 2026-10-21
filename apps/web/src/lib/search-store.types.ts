/**
 * Types for subscribing to a search.
 *
 * @module
 */

import type { SearchState } from '../hooks/use-search.types'

/** A search's state as it streams in, in the shape `useSyncExternalStore` takes. */
export interface SearchStore {
  /** Listens for changes, starting the read on the first call; returns the way to stop. */
  subscribe: (listener: () => void) => () => void
  /** The state so far. */
  snapshot: () => SearchState
}
