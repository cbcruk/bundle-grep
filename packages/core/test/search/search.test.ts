import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { compileQuery } from '../../src/plan/compile-query'
import { parseQuery } from '../../src/query/parse-query'
import { GitError } from '../../src/git/git.errors'
import { runGit as runGitAsync } from '../../src/git/run-git'
import { collectLines, search, toSearchRepoError } from '../../src/search/search'
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

describe('search edge cases', () => {
  test('a throwing holds rejects instead of yielding done', async () => {
    const plan = parseQuery('useState repo:x').andThen(compileQuery).unwrap()
    const events: SearchEvent[] = []
    const run = async (): Promise<void> => {
      for await (const event of search({ plan, repos, holds: () => { throw new Error('boom') } })) events.push(event)
    }
    expect(run()).rejects.toThrow('boom')
    await run().catch(() => undefined)
    expect(events.some(event => event.type === 'done')).toBe(false)
  })

  test('the first column is the earliest across pattern engines', async () => {
    const lines = await collectLines({
      repo: repos[0]!,
      ref: 'HEAD',
      files: ['README.md'],
      patterns: [
        { kind: 'regex', source: 'h.llo' },
        { kind: 'literal', value: 'State', quoted: false },
      ],
      context: 0,
      maxMatchesPerFile: 20,
      signal: new AbortController().signal,
    })
    expect(lines.unwrap().get('README.md')).toMatchObject([{ column: 0, ranges: [{ start: 0, end: 5 }, { start: 9, end: 14 }] }])
  })

  test('too many long paths fall back to filtering instead of overflowing the command line', async () => {
    const files = ['README.md', ...Array.from({ length: 400 }, (_, i) => `${'x'.repeat(200)}/${i}.md`)]
    const lines = await collectLines({
      repo: repos[0]!,
      ref: 'HEAD',
      files,
      patterns: [{ kind: 'literal', value: 'héllo', quoted: false }],
      context: 0,
      maxMatchesPerFile: 20,
      signal: new AbortController().signal,
    })
    expect([...lines.unwrap().keys()]).toEqual(['README.md'])
  })

  test('concurrency below 1 still searches', async () => {
    expect(files(await collect('content:useState', { concurrency: 0 }))).toHaveLength(3)
  })

  test('a repository with no refs matches nothing, a broken one still fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bundle-grep-empty-'))
    try {
      const gitDir = join(root, 'empty.git')
      runGit(root, ['init', '--quiet', '--bare', gitDir])
      mkdirSync(join(root, 'plain'))
      const searched = (repo: SearchRepo): Promise<SearchEvent[]> => collect('useState NOT foo', { repos: [repo] })

      expect(await searched({ name: 'me/empty', gitDir })).toEqual([
        { type: 'done', totalFiles: 0, facets: { languages: {}, repos: {}, paths: {} }, truncated: false },
      ])
      expect((await searched({ name: 'me/empty', gitDir, ref: 'HEAD' }))[0]).toMatchObject({ type: 'repo-error' })
      expect((await searched({ name: 'me/plain', gitDir: join(root, 'plain') }))[0]).toMatchObject({ type: 'repo-error' })

      const broken = join(root, 'broken.git')
      runGit(root, ['init', '--quiet', '--bare', broken])
      writeFileSync(join(broken, 'refs/heads/main'), `${'1'.repeat(40)}\n`)
      expect((await searched({ name: 'me/broken', gitDir: broken }))[0]).toMatchObject({ type: 'repo-error' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('symbol:', () => {
  function shown(events: SearchEvent[]): Record<string, unknown[]> {
    return Object.fromEntries(
      events.flatMap(event =>
        event.type === 'file'
          ? [[`${event.repo}/${event.path}`, event.lines.map(line => [line.number, line.context, line.column, line.ranges])]]
          : [],
      ),
    )
  }

  test('finds definitions rather than mentions, with the name highlighted', async () => {
    expect(shown(await collect('symbol:usecounter'))).toEqual({ 'me/app/src/counter.ts': [[3, false, 16, [{ start: 16, end: 26 }]]] })
    expect(shown(await collect('symbol:useState'))).toEqual({ 'me/lib/index.js': [[1, false, 6, [{ start: 6, end: 14 }]]] })
  })

  test('a regex matches part of a name', async () => {
    expect(files(await collect('symbol:/^use/'))).toEqual(['me/app/src/counter.ts', 'me/lib/index.js'])
    expect(files(await collect('symbol:/(?-i)^UseState/'))).toEqual([])
  })

  test('definition lines merge with content matches, and context surrounds them', async () => {
    expect(shown(await collect('symbol:useCounter useState'))).toEqual({
      'me/app/src/counter.ts': [
        [1, false, 9, [{ start: 9, end: 17 }]],
        [3, false, 16, [{ start: 16, end: 26 }]],
        [4, false, 14, [{ start: 14, end: 22 }]],
      ],
    })
    expect(shown(await collect('symbol:useCounter useCounter'))['me/app/src/counter.ts']).toEqual([[3, false, 16, [{ start: 16, end: 26 }]]])
    expect(shown(await collect('symbol:useCounter', { context: 1 }))['me/app/src/counter.ts']).toEqual([
      [2, true, undefined, []],
      [3, false, 16, [{ start: 16, end: 26 }]],
      [4, true, undefined, []],
    ])
    expect(shown(await collect('symbol:useState', { context: 2 }))['me/lib/index.js']).toEqual([[1, false, 6, [{ start: 6, end: 14 }]]])
  })

  test('negated, it keeps the files that define no such symbol', async () => {
    expect(files(await collect('useState -symbol:useState'))).toEqual(['me/app/README.md', 'me/app/src/counter.ts', 'me/app/src/useState.md'])
  })

  test('a qualified name finds a method by the type it belongs to, highlighting its name', async () => {
    using fixture = createFixtureRepo([
      {
        message: 'init',
        files: {
          'maint.go': 'package db\n\nfunc (m *Maint) deleteRows() {}\nfunc (o Other) deleteRows() {}\n',
          'lib.rs': 'impl Maint {\n    fn deleteRows() {}\n}\n',
        },
      },
    ])
    const repo = { name: 'me/db', gitDir: join(fixture.repo, '.git') }
    const found = async (query: string): Promise<SearchEvent[]> => {
      const plan = parseQuery(query).andThen(compileQuery).unwrap()
      const events: SearchEvent[] = []
      for await (const event of search({ plan, repos: [repo], holds: () => true })) events.push(event)
      return events
    }

    expect(shown(await found('symbol:Maint.deleteRows'))).toEqual({
      'me/db/lib.rs': [[2, false, 7, [{ start: 7, end: 17 }]]],
      'me/db/maint.go': [[3, false, 16, [{ start: 16, end: 26 }]]],
    })
    expect(Object.keys(shown(await found('symbol:Maint::deleteRows language:rust')))).toEqual(['me/db/lib.rs'])
    expect(shown(await found('symbol:deleteRows'))['me/db/maint.go']).toHaveLength(2)
  })

  test('the index is built on first use and kept in the repository', async () => {
    expect(existsSync(join(repos[0]!.gitDir, 'bundle-grep-symbols.json'))).toBe(true)
  })
})

describe('runGit', () => {
  test('an argument list the OS refuses is an error value, not a throw', async () => {
    const result = await runGitAsync(['grep', '-e', 'x'.repeat(4 * 1024 * 1024)], { cwd: repos[0]!.gitDir })
    expect(result.isErr()).toBe(true)
  })
})
