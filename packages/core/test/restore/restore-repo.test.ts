import { describe, expect, test } from 'bun:test'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { compileQuery, listArchive, parseQuery, restoreRepo, restoreRepos, search, syncRepo } from '../../src'
import type { ArchiveLayout, SyncTarget } from '../../src'
import { createFixtureRepo, isolateGitConfig, runGit } from '../fixture'
import type { FixtureRepo } from '../fixture'

isolateGitConfig()

const FIRST = [{ message: 'init', files: { 'src/a.ts': 'export const needle = 1\n' } }]
const REPO = { owner: 'acme', name: 'widgets' }

function layoutOf(fixture: FixtureRepo, cache = 'cache'): ArchiveLayout {
  return { archiveDir: join(fixture.root, 'archive'), cacheDir: join(fixture.root, cache) }
}

function targetOf(fixture: FixtureRepo): SyncTarget {
  return { ...REPO, url: fixture.repo }
}

describe('restoreRepo', () => {
  test('rebuilds a deleted cache that can be searched', async () => {
    using fixture = createFixtureRepo(FIRST)
    const layout = layoutOf(fixture)
    const synced = (await syncRepo(targetOf(fixture), layout)).unwrap()
    rmSync(layout.cacheDir, { recursive: true })

    const outcome = (await restoreRepo(REPO, layout)).unwrap()

    expect(outcome).toEqual({
      status: 'created',
      paths: synced.paths,
      defaultBranch: 'main',
      head: synced.metadata.head,
    })
    expect(runGit(outcome.paths.gitDir, ['symbolic-ref', 'HEAD'])).toBe('refs/heads/main')
    const plan = parseQuery('needle').andThen(compileQuery).unwrap()
    const found = []
    for await (const event of search({ plan, repos: [{ name: 'acme/widgets', gitDir: outcome.paths.gitDir }], holds: () => true })) {
      if (event.type === 'file') found.push(event.path)
    }
    expect(found).toEqual(['src/a.ts'])
  })

  test('leaves a cache that already matches alone', async () => {
    using fixture = createFixtureRepo(FIRST)
    const layout = layoutOf(fixture)
    await syncRepo(targetOf(fixture), layout)

    expect((await restoreRepo(REPO, layout)).unwrap().status).toBe('unchanged')
  })

  test('brings an older cache to exactly the bundle', async () => {
    using fixture = createFixtureRepo(FIRST)
    fixture.git('branch', 'gone')
    const archived = layoutOf(fixture)
    const restored = { ...archived, cacheDir: join(fixture.root, 'restored') }
    await syncRepo(targetOf(fixture), archived)
    await restoreRepo(REPO, restored)

    fixture.git('commit', '--quiet', '--allow-empty', '--message', 'more')
    fixture.git('branch', '--delete', 'gone')
    const synced = (await syncRepo(targetOf(fixture), archived)).unwrap()
    const outcome = (await restoreRepo(REPO, restored)).unwrap()

    expect(outcome).toMatchObject({ status: 'updated', head: synced.metadata.head })
    expect(runGit(outcome.paths.gitDir, ['for-each-ref', '--format=%(refname)'])).toBe('refs/heads/main')
  })

  test('restores a bundle copied over without its metadata', async () => {
    using fixture = createFixtureRepo(FIRST)
    fixture.git('branch', 'main-old')
    fixture.git('checkout', '--quiet', '-b', 'trunk')
    fixture.git('commit', '--quiet', '--allow-empty', '--message', 'trunk')
    const synced = (await syncRepo(targetOf(fixture), layoutOf(fixture))).unwrap()
    const elsewhere = layoutOf(fixture, 'elsewhere-cache')
    elsewhere.archiveDir = join(fixture.root, 'elsewhere')
    mkdirSync(join(elsewhere.archiveDir, 'acme'), { recursive: true })
    copyFileSync(synced.paths.bundle, join(elsewhere.archiveDir, 'acme', 'widgets.bundle'))

    const outcome = (await restoreRepo(REPO, elsewhere)).unwrap()

    expect(outcome).toMatchObject({ status: 'created', defaultBranch: 'trunk', head: fixture.git('rev-parse', 'trunk') })
  })

  test('refuses a bundle that does not match its metadata, before touching the cache', async () => {
    using fixture = createFixtureRepo([...FIRST, { message: 'two', files: { 'b.ts': 'b\n' } }])
    const layout = layoutOf(fixture)
    const synced = (await syncRepo(targetOf(fixture), layout)).unwrap()
    rmSync(layout.cacheDir, { recursive: true })
    using older = createFixtureRepo(FIRST)
    writeFileSync(synced.paths.bundle, readFileSync(older.bundle))
    const metadata = { ...synced.metadata, bundleSize: statSync(older.bundle).size }
    writeFileSync(synced.paths.metadata, JSON.stringify(metadata))

    const result = await restoreRepo(REPO, layout)

    expect(result.isErr() && result.error._tag).toBe('ArchiveMismatchError')
    expect(existsSync(layout.cacheDir)).toBe(false)
  })

  test('refuses a bundle whose size differs from its metadata', async () => {
    using fixture = createFixtureRepo(FIRST)
    const layout = layoutOf(fixture)
    const synced = (await syncRepo(targetOf(fixture), layout)).unwrap()
    const whole = readFileSync(synced.paths.bundle)
    writeFileSync(synced.paths.bundle, whole.subarray(0, whole.length - 40))

    const result = await restoreRepo(REPO, layout)

    expect(result.isErr() && result.error._tag).toBe('ArchiveMismatchError')
  })

  test('fails on a truncated bundle without metadata', async () => {
    using fixture = createFixtureRepo(FIRST)
    const layout = layoutOf(fixture)
    const synced = (await syncRepo(targetOf(fixture), layout)).unwrap()
    rmSync(synced.paths.metadata)
    rmSync(layout.cacheDir, { recursive: true })
    const whole = readFileSync(synced.paths.bundle)
    writeFileSync(synced.paths.bundle, whole.subarray(0, whole.length - 40))

    const result = await restoreRepo(REPO, layout)

    expect(result.isErr() && result.error._tag).toBe('GitError')
  })

  test('reports an empty repository as empty, and a stale bundle beside it as a mismatch', async () => {
    using fixture = createFixtureRepo([])
    const layout = layoutOf(fixture)
    const synced = (await syncRepo(targetOf(fixture), layout)).unwrap()

    expect((await restoreRepo(REPO, layout)).unwrap()).toMatchObject({ status: 'empty', head: null })

    using other = createFixtureRepo(FIRST)
    copyFileSync(other.bundle, synced.paths.bundle)
    const result = await restoreRepo(REPO, layout)
    expect(result.isErr() && result.error.message).toContain('records an empty repository')
  })

  test('reports a missing bundle and unreadable metadata', async () => {
    using fixture = createFixtureRepo(FIRST)
    const layout = layoutOf(fixture)
    const synced = (await syncRepo(targetOf(fixture), layout)).unwrap()
    rmSync(synced.paths.bundle)

    const missing = await restoreRepo(REPO, layout)
    expect(missing.isErr() && missing.error._tag).toBe('ArchiveMismatchError')

    writeFileSync(synced.paths.metadata, '{')
    const unreadable = await restoreRepo(REPO, layout)
    expect(unreadable.isErr() && unreadable.error._tag).toBe('FileSystemError')
  })
})

describe('listArchive', () => {
  test('lists bundles and metadata-only repositories, skipping other files', async () => {
    using fixture = createFixtureRepo(FIRST)
    const layout = layoutOf(fixture)
    await syncRepo(targetOf(fixture), layout)
    await syncRepo({ owner: 'acme', name: 'alpha', url: fixture.repo }, layout)
    rmSync(join(layout.archiveDir, 'acme', 'alpha.bundle'))
    mkdirSync(join(layout.archiveDir, 'zed'))
    writeFileSync(join(layout.archiveDir, 'zed', 'x.bundle.1234.tmp'), '')
    writeFileSync(join(layout.archiveDir, 'zed', 'notes.txt'), '')
    writeFileSync(join(layout.archiveDir, 'zed', 'bad name.bundle'), '')

    const entries = (await listArchive(layout)).unwrap()

    expect(entries.map(entry => `${entry.owner}/${entry.name}`)).toEqual(['acme/alpha', 'acme/widgets'])
  })

  test('treats a missing archive as empty', async () => {
    expect((await listArchive({ archiveDir: '/nonexistent/bundle-grep', cacheDir: '/nonexistent/c' })).unwrap()).toEqual(
      [],
    )
  })
})

describe('restoreRepos', () => {
  test('carries on after a repository fails', async () => {
    using fixture = createFixtureRepo(FIRST)
    const layout = layoutOf(fixture)
    await syncRepo(targetOf(fixture), layout)
    await syncRepo({ owner: 'acme', name: 'alpha', url: fixture.repo }, layout)
    writeFileSync(join(layout.archiveDir, 'acme', 'alpha.bundle'), 'garbage')

    const events = []
    for await (const event of restoreRepos((await listArchive(layout)).unwrap(), layout)) events.push(event)

    expect(events.map(event => [event.type, event.entry.name])).toEqual([
      ['failed', 'alpha'],
      ['restored', 'widgets'],
    ])
  })
})
