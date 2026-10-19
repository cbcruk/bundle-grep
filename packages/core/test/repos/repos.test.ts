import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { compileQuery, loadArchivedRepos, parseQuery, repoHolds, restoreRepo, search, syncRepo } from '../../src'
import type { ArchivedRepo, ArchiveLayout, FilterLeaf, RepoMetadata } from '../../src'
import { createFixtureRepo, isolateGitConfig, runGit, type FixtureRepo } from '../fixture'

isolateGitConfig()

const METADATA: RepoMetadata = {
  version: 1,
  owner: 'acme',
  name: 'widgets',
  url: 'https://github.com/acme/widgets',
  isFork: false,
  isArchived: false,
  isPrivate: null,
  primaryLanguage: null,
  description: null,
  defaultBranch: 'main',
  head: '0'.repeat(40),
  refsDigest: 'digest',
  bundleSize: 1,
  pushedAt: null,
  syncedAt: '2026-01-01T00:00:00.000Z',
}

function repoOf(owner: string, name: string, metadata: Partial<RepoMetadata> | undefined = {}): ArchivedRepo {
  const paths = { bundle: `${name}.bundle`, metadata: `${name}.json`, gitDir: `${name}.git` }
  return {
    name: `${owner}/${name}`,
    gitDir: paths.gitDir,
    entry: { owner, name, paths },
    metadata: metadata && { ...METADATA, owner, name, ...metadata },
  }
}

function holds(repo: ArchivedRepo, key: FilterLeaf['key'], value: string): boolean {
  return repoHolds(repo, { op: 'filter', key, value })
}

describe('repoHolds', () => {
  const widgets = repoOf('Acme', 'Widgets')

  test('repo: matches owner and name, ignoring case', () => {
    expect(holds(widgets, 'repo', 'acme/widgets')).toBe(true)
    expect(holds(widgets, 'repo', 'ACME/WIDGETS')).toBe(true)
    expect(holds(widgets, 'repo', 'acme/gadgets')).toBe(false)
    expect(holds(widgets, 'repo', 'widgets')).toBe(false)
    expect(holds(widgets, 'repo', 'acme')).toBe(false)
  })

  test('org: and user: match the owner, ignoring case', () => {
    for (const key of ['org', 'user'] as const) {
      expect(holds(widgets, key, 'acme')).toBe(true)
      expect(holds(widgets, key, 'ACME')).toBe(true)
      expect(holds(widgets, key, 'acme/widgets')).toBe(false)
      expect(holds(widgets, key, 'other')).toBe(false)
    }
  })

  test('is: reads the metadata', () => {
    expect(holds(widgets, 'is', 'fork')).toBe(false)
    expect(holds(widgets, 'is', 'archived')).toBe(false)
    expect(holds(repoOf('acme', 'fork', { isFork: true }), 'is', 'fork')).toBe(true)
    expect(holds(repoOf('acme', 'old', { isArchived: true }), 'is', 'archived')).toBe(true)
    expect(holds(repoOf('acme', 'old', { isArchived: true }), 'is', 'fork')).toBe(false)
  })

  test('a repository without metadata is neither a fork nor archived', () => {
    const bare = repoOf('acme', 'bare', undefined)
    expect(holds(bare, 'is', 'fork')).toBe(false)
    expect(holds(bare, 'is', 'archived')).toBe(false)
    expect(holds(bare, 'repo', 'acme/bare')).toBe(true)
  })
})

describe('loadArchivedRepos and search', () => {
  let fixture: FixtureRepo
  let layout: ArchiveLayout

  beforeAll(async () => {
    fixture = createFixtureRepo([{ message: 'init', files: { 'a.ts': 'export const needle = 1\n' } }])
    layout = { archiveDir: join(fixture.root, 'archive'), cacheDir: join(fixture.root, 'cache') }
    const url = fixture.repo
    for (const target of [
      { owner: 'acme', name: 'widgets', url },
      { owner: 'acme', name: 'fork', url, isFork: true },
      { owner: 'acme', name: 'old', url, isArchived: true },
      { owner: 'Other', name: 'tools', url },
      { owner: 'other', name: 'unrestored', url },
      { owner: 'acme', name: 'halfbuilt', url },
      { owner: 'acme', name: 'lost', url },
    ]) {
      ;(await syncRepo(target, layout)).unwrap()
    }
    rmSync(join(layout.cacheDir, 'other', 'unrestored.git'), { recursive: true })
    const halfBuilt = join(layout.cacheDir, 'acme', 'halfbuilt.git')
    rmSync(halfBuilt, { recursive: true })
    mkdirSync(halfBuilt)
    runGit(halfBuilt, ['init', '--quiet', '--bare'])
    rmSync(join(layout.cacheDir, 'acme', 'lost.git'), { recursive: true })
    rmSync(join(layout.archiveDir, 'acme', 'lost.bundle'))

    using empty = createFixtureRepo([])
    ;(await syncRepo({ owner: 'acme', name: 'empty', url: empty.repo }, layout)).unwrap()

    mkdirSync(join(layout.archiveDir, 'loose'))
    copyFileSync(fixture.bundle, join(layout.archiveDir, 'loose', 'bare.bundle'))
    ;(await restoreRepo({ owner: 'loose', name: 'bare' }, layout)).unwrap()

    writeFileSync(join(layout.archiveDir, 'acme', 'broken.json'), '{')
  })

  afterAll(() => fixture[Symbol.dispose]())

  async function found(query: string, repos?: ArchivedRepo[]): Promise<string[]> {
    const plan = parseQuery(query).andThen(compileQuery).unwrap()
    const searched = repos ?? (await loadArchivedRepos(layout)).unwrap().repos
    const names: string[] = []
    for await (const event of search({ plan, repos: searched, holds: repoHolds })) {
      if (event.type === 'repo-error') throw event.error
      if (event.type === 'file') names.push(event.repo)
    }
    return names.sort()
  }

  test('a restored half-built cache becomes searchable', async () => {
    const half = (await loadArchivedRepos(layout)).unwrap().unrestored.find(entry => entry.name === 'halfbuilt')!
    expect((await restoreRepo(half, layout)).unwrap().status).toBe('updated')
    expect((await loadArchivedRepos(layout)).unwrap().repos.map(repo => repo.name)).toContain('acme/halfbuilt')
    rmSync(half.paths.gitDir, { recursive: true })
    mkdirSync(half.paths.gitDir)
    runGit(half.paths.gitDir, ['init', '--quiet', '--bare'])
  })

  test('sorts the archive into searchable, empty, unrestored and invalid', async () => {
    const loaded = (await loadArchivedRepos(layout)).unwrap()

    expect(loaded.repos.map(repo => repo.name)).toEqual(['Other/tools', 'acme/fork', 'acme/old', 'acme/widgets', 'loose/bare'])
    expect(loaded.repos.find(repo => repo.name === 'acme/fork')?.metadata?.isFork).toBe(true)
    expect(loaded.repos.find(repo => repo.name === 'loose/bare')?.metadata).toBeUndefined()
    expect(loaded.empty.map(entry => entry.name)).toEqual(['empty'])
    expect(loaded.unrestored.map(entry => entry.name).sort()).toEqual(['halfbuilt', 'unrestored'])
    expect(loaded.invalid.map(error => error.path)).toEqual([
      join(layout.archiveDir, 'acme', 'broken.json'),
      join(layout.archiveDir, 'acme', 'lost.bundle'),
    ])
  })

  test('a missing archive holds nothing', async () => {
    const missing = { archiveDir: join(fixture.root, 'none'), cacheDir: join(fixture.root, 'none-cache') }
    expect((await loadArchivedRepos(missing)).unwrap()).toEqual({ repos: [], empty: [], unrestored: [], invalid: [] })
  })

  test.each([
    ['needle', ['Other/tools', 'acme/fork', 'acme/old', 'acme/widgets', 'loose/bare']],
    ['needle repo:ACME/Widgets', ['acme/widgets']],
    ['needle repo:acme/widgets OR repo:other/tools', ['Other/tools', 'acme/widgets']],
    ['needle -repo:acme/widgets org:acme', ['acme/fork', 'acme/old']],
    ['needle user:other', ['Other/tools']],
    ['needle is:fork', ['acme/fork']],
    ['needle -is:fork -is:archived', ['Other/tools', 'acme/widgets', 'loose/bare']],
    ['needle is:archived OR is:fork', ['acme/fork', 'acme/old']],
    ['needle NOT (org:acme OR org:loose)', ['Other/tools']],
  ])('%p searches only matching repositories', async (query, expected) => {
    expect(await found(query)).toEqual(expected)
  })

  test('runs no git in repositories the filters rule out', async () => {
    const { repos } = (await loadArchivedRepos(layout)).unwrap()
    const broken = repos.map(repo => (repo.name === 'acme/widgets' ? repo : { ...repo, gitDir: join(fixture.root, 'missing.git') }))
    expect(await found('needle repo:acme/widgets', broken)).toEqual(['acme/widgets'])
  })
})
