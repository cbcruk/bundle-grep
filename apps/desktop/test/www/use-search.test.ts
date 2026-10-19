import { describe, expect, test } from 'bun:test'

import { applyEvent, finishSearch, RUNNING } from '../../www/src/hooks/use-search.utils'

describe('search state', () => {
  test('folds stream events in, ignoring heartbeats', () => {
    let state = RUNNING
    state = applyEvent(state, { type: 'archive', repos: 1, unrestored: [], invalid: [] })
    state = applyEvent(state, { type: 'heartbeat' })
    state = applyEvent(state, { type: 'file', repo: 'me/app', path: 'a.ts', lines: [] })
    state = applyEvent(state, { type: 'repo-error', repo: 'me/b', error: { _tag: 'GitError', message: 'boom' } })
    const facets = { languages: {}, repos: { 'me/app': 1 }, paths: { '': 1 } }
    state = applyEvent(state, { type: 'done', totalFiles: 1, facets, truncated: false })
    expect(state).toMatchObject({
      status: 'running',
      archive: { repos: 1 },
      files: [{ path: 'a.ts' }],
      failures: [{ repo: 'me/b' }],
      done: { totalFiles: 1 },
    })
    expect(RUNNING.files).toEqual([])
  })

  test('ends as done, or as an error with the reason', () => {
    expect(finishSearch(RUNNING, { ok: true, value: undefined }).status).toBe('done')
    expect(finishSearch(RUNNING, { ok: false, error: { _tag: 'QueryCompileError', message: 'bad' } })).toMatchObject({
      status: 'error',
      error: { _tag: 'QueryCompileError' },
    })
  })
})
