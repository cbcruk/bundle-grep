import { describe, expect, test, vi } from 'vitest'

import type { SearchStreamEvent } from '../src/api/api.types'
import { applyEvent, finishSearch, RUNNING } from '../src/hooks/use-search.utils'
import { searchStore } from '../src/lib/search-store'

describe('search state', () => {
  test('folds stream events in', () => {
    let state = RUNNING
    state = applyEvent(state, { type: 'archive', repos: 1, unrestored: [], invalid: [] })
    state = applyEvent(state, { type: 'file', repo: 'me/app', path: 'a.ts', lines: [] })
    const commit = { sha: 'c', parent: null, date: '2026-01-01T00:00:00Z', author: 'Me', subject: 's' }
    state = applyEvent(state, { type: 'commit', repo: 'me/app', commit, files: [] })
    state = applyEvent(state, { type: 'repo-error', repo: 'me/b', error: { _tag: 'GitError', message: 'boom' } })
    const facets = { languages: {}, repos: { 'me/app': 1 }, paths: { '': 1 } }
    state = applyEvent(state, { type: 'done', totalFiles: 1, facets, truncated: false })
    expect(state).toMatchObject({
      status: 'running',
      archive: { repos: 1 },
      files: [{ path: 'a.ts' }],
      commits: [{ commit: { sha: 'c' } }],
      failures: [{ repo: 'me/b' }],
      done: { totalFiles: 1 },
    })
    expect(RUNNING.files).toEqual([])
    expect(RUNNING.commits).toEqual([])
  })

  test('ends as done, or as an error with the reason', () => {
    expect(finishSearch(RUNNING).status).toBe('done')
    expect(finishSearch(RUNNING, new TypeError('fetch failed'))).toMatchObject({
      status: 'error',
      error: { _tag: 'Error', message: 'fetch failed' },
    })
    const rejected = applyEvent(RUNNING, { type: 'error', error: { _tag: 'QueryCompileError', message: 'bad' } })
    expect(rejected).toMatchObject({ status: 'error', error: { _tag: 'QueryCompileError' } })
    expect(finishSearch(rejected)).toBe(rejected)
  })
})

describe('searchStore', () => {
  function streamOf(events: SearchStreamEvent[]): ReadableStream<SearchStreamEvent> {
    return new ReadableStream({
      start(controller): void {
        for (const event of events) controller.enqueue(event)
        controller.close()
      },
    })
  }

  test('reads the stream once a component subscribes, and keeps one store per stream', async () => {
    const stream = streamOf([{ type: 'archive', repos: 2, unrestored: [], invalid: [] }])
    const store = searchStore(stream)
    expect(searchStore(stream)).toBe(store)
    expect(stream.locked).toBe(false)
    const listener = vi.fn()
    store.subscribe(listener)
    await vi.waitFor(() => expect(store.snapshot().status).toBe('done'))
    expect(store.snapshot().archive?.repos).toBe(2)
    expect(listener).toHaveBeenCalled()
  })

  test('cancels the stream when the last subscriber leaves, but not across a remount', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<SearchStreamEvent>({ cancel })
    const store = searchStore(stream)
    store.subscribe(() => undefined)()
    const again = store.subscribe(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(cancel).not.toHaveBeenCalled()
    again()
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled())
    expect(store.snapshot()).toMatchObject({ status: 'error', error: { _tag: 'AbortError' } })
  })
})
