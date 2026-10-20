import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { compileQuery } from '../../src/plan/compile-query'
import { parseQuery } from '../../src/query/parse-query'
import { search } from '../../src/search/search'
import type { SearchEvent, SearchOptions, SearchRepo } from '../../src/search/search.types'
import { createFixtureRepo, runGit, type FixtureCommit, type FixtureRepo } from '../fixture'

const fixtures: FixtureRepo[] = []
const repos: SearchRepo[] = []
const shas: Record<string, string> = {}

function addRepo(name: string, commits: FixtureCommit[], setup: (fixture: FixtureRepo) => void = () => {}): FixtureRepo {
  const fixture = createFixtureRepo(commits)
  setup(fixture)
  const gitDir = join(fixture.root, 'repo.git')
  runGit(fixture.root, ['clone', '--quiet', '--bare', fixture.repo, gitDir])
  fixtures.push(fixture)
  repos.push({ name, gitDir })
  return fixture
}

beforeAll(() => {
  const hist = addRepo(
    'me/hist',
    [
      { message: 'init', files: { 'src/a.ts': 'export const oldName = 1\n', 'README.md': 'hello\n' } },
      { message: 'rename', files: { 'src/a.ts': 'export const newName = 1\n' } },
      { message: 'move docs', files: { 'src/a.ts': null, 'docs/b.md': 'oldName was here\n' } },
    ],
    fixture => {
      fixture.git('tag', 'v1', 'HEAD~2')
      fixture.git('branch', 'dev', 'HEAD~1')
    },
  )
  for (const [key, rev] of [['init', 'HEAD~2'], ['rename', 'HEAD~1'], ['move', 'HEAD']] as const) shas[key] = hist.git('rev-parse', rev)
  addRepo('me/other', [{ message: 'python', files: { 'x.py': 'oldName = 2\n' } }])
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

/** Each repository's commits in the order they came, with repositories, which are searched at once, sorted. */
function commits(events: SearchEvent[]): string[] {
  return events
    .filter((event): event is Extract<SearchEvent, { type: 'commit' }> => event.type === 'commit')
    .toSorted((a, b) => a.repo.localeCompare(b.repo))
    .map(
      ({ repo, commit, files }) =>
        `${repo} ${commit.subject}: ${files.map(file => `${file.path} ${file.lines.map(line => `${line.change === 'added' ? '+' : '-'}${line.number}`).join(' ')}`).join(', ')}`,
    )
}

function done(events: SearchEvent[]): Extract<SearchEvent, { type: 'done' }> {
  const last = events.at(-1)
  if (last?.type !== 'done') throw new Error('expected done last')
  return last
}

describe('history:', () => {
  test('finds every commit that added or removed a matching line, newest first', async () => {
    const events = await collect('history:oldName')
    expect(commits(events)).toEqual([
      'me/hist move docs: docs/b.md +1',
      'me/hist rename: src/a.ts -1',
      'me/hist init: src/a.ts +1',
      'me/other python: x.py +1',
    ])
    expect(done(events)).toMatchObject({
      totalCommits: 4,
      totalFiles: 4,
      truncated: false,
      facets: { repos: { 'me/hist': 3, 'me/other': 1 }, languages: { Markdown: 1, TypeScript: 2, Python: 1 } },
    })
  })

  test('describes each commit and highlights the match', async () => {
    const event = (await collect('history:oldname repo:me/hist')).find(
      (candidate): candidate is Extract<SearchEvent, { type: 'commit' }> => candidate.type === 'commit' && candidate.commit.subject === 'rename',
    )
    expect(event?.commit).toEqual({ sha: shas.rename!, parent: shas.init!, date: expect.stringMatching(/^2026-01-01T00:00:00/), author: 'Fixture', subject: 'rename' })
    expect(event?.files).toEqual([
      { path: 'src/a.ts', language: 'TypeScript', lines: [{ change: 'removed', number: 1, text: 'export const oldName = 1', ranges: [{ start: 13, end: 20 }] }] },
    ])
  })

  test('finds code that no longer exists, and gives a root commit no parent', async () => {
    const events = await collect('history:newName')
    expect(commits(events)).toEqual(['me/hist move docs: src/a.ts -1', 'me/hist rename: src/a.ts +1'])
    const root = (await collect('history:hello')).find(event => event.type === 'commit')
    expect(root?.type === 'commit' && root.commit).toMatchObject({ sha: shas.init, parent: null })
  })

  test('narrows by path and language', async () => {
    expect(commits(await collect('history:oldName path:src'))).toEqual(['me/hist rename: src/a.ts -1', 'me/hist init: src/a.ts +1'])
    expect(commits(await collect('history:oldName language:python'))).toEqual(['me/other python: x.py +1'])
    expect(commits(await collect('history:oldName -path:src'))).toEqual(['me/hist move docs: docs/b.md +1', 'me/other python: x.py +1'])
  })

  test('ignores case unless the regex starts with (?-i)', async () => {
    expect(commits(await collect('history:OLDNAME'))).toHaveLength(4)
    expect(commits(await collect('history:/(?-i)OLDNAME/'))).toEqual([])
    expect(commits(await collect('history:/(?-i)old[A-Z]ame/ path:src'))).toHaveLength(2)
  })

  test('the limit counts commits', async () => {
    const events = await collect('history:oldName', { limit: 2 })
    expect(commits(events)).toHaveLength(2)
    expect(done(events)).toMatchObject({ totalCommits: 4, truncated: true })
  })

  test('starts from ref: when given, skipping repositories without it', async () => {
    expect(commits(await collect('history:oldName ref:v1'))).toEqual(['me/hist init: src/a.ts +1'])
    expect(commits(await collect('history:newName ref:dev'))).toEqual(['me/hist rename: src/a.ts +1'])
  })
})

describe('history: with unusual repositories', () => {
  test('a config that merges hunks or a marker byte in a change does not change what is found', async () => {
    const odd = createFixtureRepo([
      { message: 'init', files: { 'x.txt': 'a\nb\nc\nd\ne\n', 'y.txt': 'keep\nneedle old\n' } },
      { message: 'edit', files: { 'x.txt': 'needle A\nb\nc\nd\nneedle E\n', 'y.txt': 'keep\n', 'z.txt': 'x\x1eneedle\n' } },
    ])
    fixtures.push(odd)
    const gitDir = join(odd.root, 'repo.git')
    runGit(odd.root, ['clone', '--quiet', '--bare', odd.repo, gitDir])
    runGit(gitDir, ['config', 'diff.interHunkContext', '5'])
    const events = await collect('history:needle', { repos: [{ name: 'me/odd', gitDir }] })
    expect(commits(events)).toEqual(['me/odd edit: x.txt +1 +5, y.txt -2, z.txt +1', 'me/odd init: y.txt +2'])
    expect(done(events)).toMatchObject({ totalCommits: 2 })
  })
})

describe('ref:', () => {
  test('searches the files at another ref, naming the commit in each file event', async () => {
    const events = await collect('ref:v1 oldName')
    expect(events.filter(event => event.type === 'file')).toEqual([
      expect.objectContaining({ repo: 'me/hist', path: 'src/a.ts', commit: shas.init }),
    ])
    expect(done(events)).toMatchObject({ totalFiles: 1, facets: { repos: { 'me/hist': 1 } } })
  })

  test('accepts branches and commit ids', async () => {
    const paths = (events: SearchEvent[]): string[] => events.flatMap(event => (event.type === 'file' ? [event.path] : []))
    expect(paths(await collect('ref:dev content:newName'))).toEqual(['src/a.ts'])
    expect(paths(await collect(`ref:${shas.rename!.slice(0, 10)} content:newName`))).toEqual(['src/a.ts'])
    expect(paths(await collect('content:newName'))).toEqual([])
  })

  test('without ref:, file events name no commit', async () => {
    const file = (await collect('content:oldName repo:me/hist')).find(event => event.type === 'file')
    expect(file).toBeDefined()
    expect(file).not.toHaveProperty('commit')
  })
})
