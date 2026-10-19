/**
 * Runs the search for the current query.
 *
 * @module
 */

import { useEffect, useState } from 'react'

import { streamSearch } from '../api/stream-search'
import type { SearchState } from './use-search.types'
import { applyEvent, finishSearch, IDLE, RUNNING } from './use-search.utils'

/** Context lines shown around each match. */
const CONTEXT = 1

/**
 * Streams the search for `q`, re-rendering at most once a frame as results
 * arrive.
 *
 * A new query or limit aborts the search before it, which stops it on the
 * server too, so only the latest search's results are ever shown.
 */
export function useSearch(q: string, limit: number): SearchState {
  const [state, setState] = useState<SearchState>(IDLE)

  useEffect(() => {
    if (q.trim() === '') {
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    let latest = RUNNING
    let frame = 0
    setState(latest)
    const flush = (): void => {
      frame = 0
      setState(latest)
    }
    void streamSearch({
      q,
      limit,
      context: CONTEXT,
      signal: controller.signal,
      onEvent: event => {
        latest = applyEvent(latest, event)
        frame ||= requestAnimationFrame(flush)
      },
    }).then(result => {
      if (controller.signal.aborted) return
      cancelAnimationFrame(frame)
      frame = 0
      setState(finishSearch(latest, result))
    })
    return (): void => {
      controller.abort()
      cancelAnimationFrame(frame)
    }
  }, [q, limit])

  return state
}
