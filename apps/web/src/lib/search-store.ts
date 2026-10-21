/**
 * Folds a search stream into state that components can subscribe to.
 *
 * @module
 */

import type { SearchStreamEvent } from '../api/api.types'
import type { SearchState } from '../hooks/use-search.types'
import { applyEvent, finishSearch, RUNNING } from '../hooks/use-search.utils'
import type { SearchStore } from './search-store.types'

const stores = new WeakMap<ReadableStream<SearchStreamEvent>, SearchStore>()

const frame = (callback: () => void): (() => void) => {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(callback)
    return (): void => cancelAnimationFrame(id)
  }
  const id = setTimeout(callback, 16)
  return (): void => clearTimeout(id)
}

/**
 * The store for a search stream, one per stream.
 *
 * Reading starts with the first subscriber, and listeners hear of new events
 * at most once a frame. When the last subscriber leaves and none returns
 * within a tick — as React does when it remounts a component in development —
 * the stream is cancelled, which stops the search on the server too.
 */
export function searchStore(stream: ReadableStream<SearchStreamEvent>): SearchStore {
  const known = stores.get(stream)
  if (known) return known

  const listeners = new Set<() => void>()
  let state: SearchState = RUNNING
  let reader: ReadableStreamDefaultReader<SearchStreamEvent> | undefined
  let cancelFrame: (() => void) | undefined

  const notify = (): void => {
    cancelFrame = undefined
    for (const listener of listeners) listener()
  }

  const read = async (): Promise<void> => {
    reader = stream.getReader()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        state = applyEvent(state, value)
        cancelFrame ??= frame(notify)
      }
      state = finishSearch(state)
    } catch (error) {
      state = finishSearch(state, error)
    }
    cancelFrame?.()
    notify()
  }

  const store: SearchStore = {
    subscribe(listener) {
      listeners.add(listener)
      if (!reader) void read()
      return (): void => {
        listeners.delete(listener)
        setTimeout(() => {
          if (listeners.size > 0 || state.status !== 'running') return
          state = finishSearch(state, new DOMException('Cancelled', 'AbortError'))
          void reader?.cancel()
        }, 0)
      }
    },
    snapshot: () => state,
  }
  stores.set(stream, store)
  return store
}
