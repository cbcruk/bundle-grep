/**
 * Shows the search a loader started.
 *
 * @module
 */

import { useSyncExternalStore } from 'react'

import type { SearchStreamEvent } from '../api/api.types'
import { searchStore } from '../lib/search-store'
import type { SearchState } from './use-search.types'
import { IDLE, RUNNING } from './use-search.utils'

const idle = (): (() => void) => () => undefined

/**
 * The state of a search stream as it arrives, re-rendering at most once a
 * frame; {@linkcode IDLE} with no stream.
 *
 * The server renders the search as running, and the page reads the stream
 * once it hydrates. Leaving the search, for a new query or another screen,
 * cancels the stream, which stops it on the server too.
 */
export function useSearch(stream: ReadableStream<SearchStreamEvent> | undefined): SearchState {
  const store = stream ? searchStore(stream) : undefined
  return useSyncExternalStore(
    store?.subscribe ?? idle,
    store?.snapshot ?? ((): SearchState => IDLE),
    (): SearchState => (store ? RUNNING : IDLE),
  )
}
