import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { compileQuery } from '../../src/plan/compile-query'
import { parseQuery } from '../../src/query/parse-query'
import { GitError } from '../../src/git/git.errors'
import { search, toSearchRepoError } from '../../src/search/search'
import type { SearchEvent, SearchOptions, SearchRepo } from '../../src/search/search.types'
import { createFixtureRepo, runGit, type FixtureCommit, type FixtureRepo } from '../fixture'

const fixtures: FixtureRepo[] = []
const repos: SearchRepo[] = []

function addRepo(name: string, commits: FixtureCommit[]): void {
  const fixture = createFixtureRepo(commits)
  const gitDir = join(fixture.root, 'repo.git')
  runGit(fixture.root, ['clone', '--quiet', '--bare', fixture.bundle, gitDir])
  fixtures.push(fixture)
  repos.push({ name, gitDir })
}

beforeAll(() => {
  addRepo('me/app', [
    {
      message: 'init',
      files: {
        'src/counter.ts': 'import { useState } from "react"\n\nexport function useCounter(): number {\n  const [n] = useState(0)\n  return n\n}\n',
        'src/useState.md': 'docs\n',
        'README.md': 'héllo useState\n',
      },
    },
  ])
  addRepo('me/lib', [{ message: 'init', files: { 'index.js': 'const useState = 1\n', 'go/main.go': 'package main\n' } }])
})

afterAll(() => {
  for (const fixture of fixtures) fixture[Symbol.dispose]()
})

async function collect(query: string, options: Partial<SearchOptions> = {}): Promise<SearchEvent[]> {
  const plan = parseQuery(query).andThen(compileQuery).unwrap()
  const events: SearchEvent[] = []
  for await (const event of search({ plan, repos, holds: () => true, ...options })) events.push(event)
  return events
}

function files(events: SearchEvent[]): string[] {
  return events.flatMap(event => (event.type === 'file' ? [`${event.repo}/${event.path}`] : [])).sort()
}

function done(events: SearchEvent[]): Extract<SearchEvent, { type: 'done' }> {
  const last = events.at(-1)
  if (last?.type !== 'done') throw new Error('expected done last')
  return last
}

describe('search', () => {
  test('streams matching files with lines and ranges, then done', async () => {
    const events = await collect('content:useState')
    expect(files(events)).toEqual(['me/app/README.md', 'me/app/src/counter.ts', 'me/lib/index.js'])

    const counter = events.find(event => event.type === 'file' && event.path === 'src/counter.ts')
    expect(counter).toMatchObject({
      language: 'TypeScript',
      lines: [
        { number: 1, context: false, column: 9, ranges: [{ start: 9, end: 17 }] },
        { number: 4, context: false, column: 14, ranges: [{ start: 14, end: 22 }] },
      ],
    })
  })

  test('columns and ranges are UTF-16 indexes', async () => {
    const events = await collect('content:useState repo:me/app')
    const readme = events.find(event => event.type === 'file' && event.path === 'README.md')
    expect(readme).toMatchObject({ lines: [{ text: 'héllo useState', column: 6, ranges: [{ start: 6, end: 14 }] }] })
  })

  test('context lines', async () => {
    const events = await collect('content:useCounter', { context: 1 })
    const counter = events.find(event => event.type === 'file')
    expect(counter).toMatchObject({
      lines: [
        { number: 2, context: true, ranges: [] },
        { number: 3, context: false },
        { number: 4, context: true },
      ],
    })
  })

  test('a file matched by path alone has no lines', async () => {
    const events = await collect('path:*.md NOT content:useState')
    expect(files(events)).toEqual(['me/app/src/useState.md'])
    expect(events.find(event => event.type === 'file')).toMatchObject({ lines: [] })
  })

  test('maxMatchesPerFile caps lines', async () => {
    const events = await collect('content:useState path:counter', { maxMatchesPerFile: 1 })
    expect(events.find(event => event.type === 'file')).toMatchObject({ lines: [{ number: 1 }] })
  })

  test('repositories ruled out by qualifiers are skipped', async () => {
    const holds: SearchOptions['holds'] = (repo, filter) => filter.key === 'repo' && filter.value === repo.name
    expect(files(await collect('useState repo:me/lib', { holds }))).toEqual(['me/lib/index.js'])
  })

  test('facets count every matching file', async () => {
    expect(done(await collect('useState')).facets).toEqual({
      languages: { Markdown: 2, TypeScript: 1, JavaScript: 1 },
      repos: { 'me/app': 3, 'me/lib': 1 },
      paths: { src: 2, '': 2 },
    })
  })

  test('the limit stops file events but not the totals', async () => {
    const events = await collect('useState', { limit: 2, concurrency: 1 })
    expect(files(events)).toHaveLength(2)
    expect(done(events)).toMatchObject({ totalFiles: 4, truncated: true })
  })

  test('a failing repository yields repo-error and the rest carry on', async () => {
    const plan = parseQuery('content:useState').andThen(compileQuery).unwrap()
    const broken = [{ name: 'me/broken', gitDir: repos[0]!.gitDir, ref: 'missing' }, repos[1]!]
    const events: SearchEvent[] = []
    for await (const event of search({ plan, repos: broken, holds: () => true })) events.push(event)

    expect(events.find(event => event.type === 'repo-error')).toMatchObject({
      repo: 'me/broken',
      error: { _tag: 'GitError' },
    })
    expect(files(events)).toEqual(['me/lib/index.js'])
  })

  test('an aborted signal stops the search', async () => {
    const events = await collect('useState', { signal: AbortSignal.abort() })
    expect(events).toEqual([
      {
        type: 'done',
        totalFiles: 0,
        facets: { languages: {}, repos: {}, paths: {} },
        truncated: false,
        stopped: 'aborted',
      },
    ])
  })

  test('a timeout stops the search', async () => {
    expect(done(await collect('useState', { timeoutMs: 0 }))).toMatchObject({ stopped: 'timeout' })
  })

  test('breaking out early does not hang', async () => {
    const plan = parseQuery('useState').andThen(compileQuery).unwrap()
    for await (const event of search({ plan, repos, holds: () => true })) {
      expect(event.type).toBe('file')
      break
    }
  })
})

describe('toSearchRepoError', () => {
  test('a git without PCRE', () => {
    const error = new GitError({
      args: ['grep', '-P'],
      exitCode: 128,
      stderr: 'fatal: cannot use Perl-compatible regexes when not compiled with USE_LIBPCRE',
      message: 'git grep failed',
    })
    expect(toSearchRepoError(error)._tag).toBe('PcreUnavailableError')
  })

  test('any other failure passes through', () => {
    const error = new GitError({ args: ['grep'], exitCode: 128, stderr: 'fatal: bad revision', message: 'x' })
    expect(toSearchRepoError(error)).toBe(error)
  })
})
