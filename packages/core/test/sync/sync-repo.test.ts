import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { readMetadata, syncRepo, syncRepos } from '../../src'
import type { SyncOptions, SyncTarget } from '../../src'
import { createFixtureRepo, runGit } from '../fixture'
import type { FixtureRepo } from '../fixture'

const ISOLATED = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
const saved = Object.fromEntries(Object.keys(ISOLATED).map(key => [key, process.env[key]]))

beforeAll(() => Object.assign(process.env, ISOLATED))
afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const FIRST = [{ message: 'init', files: { 'src/a.ts': 'export const a = 1\n' } }]

function setup(fixture: FixtureRepo): { options: SyncOptions; target: SyncTarget } {
  let tick = 0
  return {
    options: {
      archiveDir: join(fixture.root, 'archive'),
      cacheDir: join(fixture.root, 'cache'),
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
    },
    target: { owner: 'acme', name: 'widgets', url: fixture.repo },
  }
}

function bundleHeads(fixture: FixtureRepo, bundle: string): string[] {
  return runGit(fixture.root, ['bundle', 'list-heads', bundle])
    .split('\n')
    .map(line => line.split(' ')[1] ?? '')
    .sort()
}

describe('syncRepo', () => {
  test('mirrors branches and tags into a verified bundle with metadata', async () => {
    using fixture = createFixtureRepo(FIRST)
    fixture.git('tag', 'v1')
    fixture.git('branch', 'dev')
    const { options, target } = setup(fixture)

    const outcome = (await syncRepo({ ...target, isFork: true, primaryLanguage: 'TypeScript' }, options)).unwrap()

    expect(outcome.status).toBe('created')
    expect(outcome.paths.bundle).toBe(join(fixture.root, 'archive', 'acme', 'widgets.bundle'))
    expect(bundleHeads(fixture, outcome.paths.bundle)).toEqual(['HEAD', 'refs/heads/dev', 'refs/heads/main', 'refs/tags/v1'])
    expect((await readMetadata(outcome.paths.metadata)).unwrap()).toEqual({
      version: 1,
      owner: 'acme',
      name: 'widgets',
      url: fixture.repo,
      isFork: true,
      isArchived: false,
      isPrivate: null,
      primaryLanguage: 'TypeScript',
      description: null,
      defaultBranch: 'main',
      head: fixture.git('rev-parse', 'HEAD'),
      refsDigest: outcome.metadata.refsDigest,
      bundleSize: statSync(outcome.paths.bundle).size,
      pushedAt: null,
      syncedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  test('skips rebuilding an unchanged bundle but refreshes its metadata', async () => {
    using fixture = createFixtureRepo(FIRST)
    const { options, target } = setup(fixture)
    const first = (await syncRepo(target, options)).unwrap()
    const before = statSync(first.paths.bundle).mtimeMs
    const contents = readFileSync(first.paths.bundle)

    const second = (await syncRepo({ ...target, isArchived: true }, options)).unwrap()

    expect(second.status).toBe('unchanged')
    expect(statSync(second.paths.bundle).mtimeMs).toBe(before)
    expect(readFileSync(second.paths.bundle)).toEqual(contents)
    expect(second.metadata.isArchived).toBe(true)
    expect(second.metadata.syncedAt).toBe('2026-01-01T00:00:01.000Z')
  })

  test('rebuilds the bundle when upstream gains commits or loses branches', async () => {
    using fixture = createFixtureRepo(FIRST)
    fixture.git('branch', 'old')
    const { options, target } = setup(fixture)
    await syncRepo(target, options)

    writeFileSync(join(fixture.repo, 'b.ts'), 'export const b = 2\n')
    fixture.git('add', '--all')
    fixture.git('commit', '--quiet', '--message', 'add b')
    fixture.git('branch', '--delete', 'old')

    const outcome = (await syncRepo(target, options)).unwrap()

    expect(outcome.status).toBe('updated')
    expect(outcome.metadata.head).toBe(fixture.git('rev-parse', 'HEAD'))
    expect(bundleHeads(fixture, outcome.paths.bundle)).toEqual(['HEAD', 'refs/heads/main'])
  })

  test('follows a change of the default branch', async () => {
    using fixture = createFixtureRepo(FIRST)
    fixture.git('branch', 'trunk')
    const { options, target } = setup(fixture)
    await syncRepo(target, options)

    fixture.git('symbolic-ref', 'HEAD', 'refs/heads/trunk')
    const outcome = (await syncRepo(target, options)).unwrap()

    expect(outcome.status).toBe('updated')
    expect(outcome.metadata.defaultBranch).toBe('trunk')
    const restored = join(fixture.root, 'restored.git')
    runGit(fixture.root, ['clone', '--quiet', '--bare', outcome.paths.bundle, restored])
    expect(runGit(restored, ['symbolic-ref', 'HEAD'])).toBe('refs/heads/trunk')
  })

  test('rebuilds a bundle that no longer holds the refs', async () => {
    using fixture = createFixtureRepo([...FIRST, { message: 'two', files: { 'b.ts': 'b\n' } }])
    const { options, target } = setup(fixture)
    const first = (await syncRepo(target, options)).unwrap()

    writeFileSync(first.paths.bundle, 'garbage')
    expect((await syncRepo(target, options)).unwrap().status).toBe('updated')

    const whole = readFileSync(first.paths.bundle)
    writeFileSync(first.paths.bundle, whole.subarray(0, whole.length - 40))
    expect((await syncRepo(target, options)).unwrap().status).toBe('updated')
    expect(readFileSync(first.paths.bundle)).toEqual(whole)

    using older = createFixtureRepo(FIRST)
    writeFileSync(first.paths.bundle, readFileSync(older.bundle))
    expect((await syncRepo(target, options)).unwrap().status).toBe('updated')
    expect(bundleHeads(fixture, first.paths.bundle)).toEqual(['HEAD', 'refs/heads/main'])
    expect(runGit(fixture.root, ['bundle', 'list-heads', first.paths.bundle])).toContain(fixture.git('rev-parse', 'main'))
  })

  test('falls back to main, master, or the first branch when the remote names no HEAD', async () => {
    using fixture = createFixtureRepo(FIRST)
    fixture.git('branch', '--move', 'main', 'trunk')
    fixture.git('checkout', '--quiet', '--detach')
    const { options, target } = setup(fixture)

    const outcome = (await syncRepo(target, options)).unwrap()

    expect(outcome.metadata).toMatchObject({ defaultBranch: 'trunk', head: fixture.git('rev-parse', 'HEAD') })
    expect(bundleHeads(fixture, outcome.paths.bundle)).toEqual(['HEAD', 'refs/heads/trunk'])
  })

  test('works on its own mirror even when GIT_DIR points elsewhere', async () => {
    using fixture = createFixtureRepo(FIRST)
    fixture.git('branch', 'mine')
    using other = createFixtureRepo([{ message: 'other', files: { 'x.txt': 'x\n' } }])
    const { options } = setup(fixture)
    const before = fixture.git('for-each-ref')

    process.env.GIT_DIR = join(fixture.repo, '.git')
    const result = await syncRepo({ owner: 'acme', name: 'other', url: other.repo }, options).finally(() => {
      delete process.env.GIT_DIR
    })

    expect(result.unwrap().metadata.head).toBe(other.git('rev-parse', 'HEAD'))
    expect(fixture.git('for-each-ref')).toBe(before)
  })

  test('is not blocked by files a killed sync left behind', async () => {
    using fixture = createFixtureRepo(FIRST)
    const { options, target } = setup(fixture)
    const first = (await syncRepo(target, options)).unwrap()
    writeFileSync(`${first.paths.bundle}.tmp.lock`, '')
    writeFileSync(`${first.paths.bundle}.tmp`, '')
    writeFileSync(`${first.paths.bundle}.lock`, '')

    fixture.git('commit', '--quiet', '--allow-empty', '--message', 'more')

    expect((await syncRepo(target, options)).unwrap().status).toBe('updated')
  })

  test('leaves credentials in the URL out of the metadata', async () => {
    using fixture = createFixtureRepo(FIRST)
    const { options, target } = setup(fixture)
    const url = 'https://user:secret@git.example.invalid/acme/widgets'
    const rewrite = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${fixture.repo}.insteadOf`, GIT_CONFIG_VALUE_0: url }

    Object.assign(process.env, rewrite)
    const outcome = await syncRepo({ ...target, url }, options).finally(() => {
      for (const key of Object.keys(rewrite)) delete process.env[key]
    })

    expect(outcome.unwrap().metadata.url).toBe('https://git.example.invalid/acme/widgets')
    expect(readFileSync(outcome.unwrap().paths.metadata, 'utf8')).not.toContain('secret')
    expect(readFileSync(outcome.unwrap().paths.metadata, 'utf8')).not.toContain('user')
  })

  test('rebuilds a bundle whose metadata is unreadable', async () => {
    using fixture = createFixtureRepo(FIRST)
    const { options, target } = setup(fixture)
    const first = (await syncRepo(target, options)).unwrap()
    writeFileSync(first.paths.metadata, '{"version": 1')

    expect((await syncRepo(target, options)).unwrap().status).toBe('updated')
    expect((await readMetadata(first.paths.metadata)).isOk()).toBe(true)
  })

  test('records a repository without commits as empty and writes no bundle', async () => {
    using fixture = createFixtureRepo([])
    const { options, target } = setup(fixture)

    const outcome = (await syncRepo(target, options)).unwrap()

    expect(outcome.status).toBe('empty')
    expect(outcome.metadata).toMatchObject({ head: null, defaultBranch: null })
    expect(() => statSync(outcome.paths.bundle)).toThrow()
  })

  test('keeps the previous bundle when fetching fails', async () => {
    using fixture = createFixtureRepo(FIRST)
    const { options, target } = setup(fixture)
    const first = (await syncRepo(target, options)).unwrap()
    const contents = readFileSync(first.paths.bundle)

    const result = await syncRepo({ ...target, url: join(fixture.root, 'missing') }, options)

    expect(result.isErr() && result.error._tag).toBe('GitError')
    expect(readFileSync(first.paths.bundle)).toEqual(contents)
  })

  test('rejects names that would escape the archive before touching the disk', async () => {
    using fixture = createFixtureRepo(FIRST)
    const { options, target } = setup(fixture)

    for (const [owner, name] of [['..', 'widgets'], ['acme', '../x'], ['acme', ''], ['a/b', 'c']] as const) {
      const result = await syncRepo({ ...target, owner, name }, options)
      expect(result.isErr() && result.error._tag).toBe('InvalidRepoNameError')
    }
    expect(() => statSync(options.cacheDir)).toThrow()
  })

  test('treats a URL that looks like an option as a repository', async () => {
    using fixture = createFixtureRepo(FIRST)
    const { options, target } = setup(fixture)
    mkdirSync(options.cacheDir)

    const result = await syncRepo({ ...target, url: '--upload-pack=touch pwned' }, options)

    expect(result.isErr()).toBe(true)
    expect(() => statSync(join(options.cacheDir, 'acme', 'widgets.git', 'pwned'))).toThrow()
  })
})

describe('syncRepos', () => {
  test('carries on after a repository fails', async () => {
    using fixture = createFixtureRepo(FIRST)
    const { options, target } = setup(fixture)
    const targets = [{ ...target, name: 'broken', url: join(fixture.root, 'missing') }, target]

    const events = []
    for await (const event of syncRepos(targets, options)) events.push(event)

    expect(events.map(event => [event.type, event.target.name])).toEqual([
      ['failed', 'broken'],
      ['synced', 'widgets'],
    ])
  })

  test('stops before the next repository once aborted', async () => {
    using fixture = createFixtureRepo(FIRST)
    const { options, target } = setup(fixture)
    const controller = new AbortController()

    const events = []
    for await (const event of syncRepos([target, { ...target, name: 'second' }], { ...options, signal: controller.signal })) {
      events.push(event)
      controller.abort()
    }

    expect(events.map(event => event.target.name)).toEqual(['widgets'])
  })
})
