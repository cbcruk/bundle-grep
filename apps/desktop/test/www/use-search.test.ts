import { describe, expect, test } from 'vitest'

import { applyEvent, finishSearch, RUNNING } from '../../www/src/hooks/use-search.utils'

describe('search state', () => {
  test('folds stream events in, ignoring heartbeats', () => {
    let state = RUNNING
    state = applyEvent(state, { type: 'archive', repos: 1, unrestored: [], invalid: [] })
    state = applyEvent(state, { type: 'heartbeat' })
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
    expect(finishSearch(RUNNING, { ok: true, value: undefined }).status).toBe('done')
    expect(finishSearch(RUNNING, { ok: false, error: { _tag: 'QueryCompileError', message: 'bad' } })).toMatchObject({
      status: 'error',
      error: { _tag: 'QueryCompileError' },
    })
  })
})
