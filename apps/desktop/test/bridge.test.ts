import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import type { ArchiveLayout } from '@bundle-grep/core'

import { createFixtureRepo, isolateGitConfig, type FixtureRepo } from '../../../packages/core/test/fixture'
import { createBridge } from '../src/bridge/create-bridge'

isolateGitConfig()

let fixture: FixtureRepo
let layout: ArchiveLayout

beforeAll(() => {
  fixture = createFixtureRepo([{ message: 'init', files: { 'a.txt': 'hello\n' } }])
  layout = { archiveDir: join(fixture.root, 'archive'), cacheDir: join(fixture.root, 'cache') }
})

afterAll(() => fixture[Symbol.dispose]())

describe('bridge', () => {
  test('settings report the layout', async () => {
    const bridge = createBridge({ layout, root: fixture.root })
    expect(await bridge.bundleGrepSettings()).toEqual({
      ok: true,
      value: { root: fixture.root, archiveDir: layout.archiveDir, cacheDir: layout.cacheDir },
    })
  })

  test('sync rejects anything but a non-empty array of sources', async () => {
    const bridge = createBridge({ layout, root: fixture.root })
    for (const sources of [undefined, 'x', [], [''], [1], ['ok', null]]) {
      expect(await bridge.bundleGrepSync(sources)).toMatchObject({ ok: false, error: { _tag: 'UsageError' } })
    }
  })

  test('sync, list, and restore work on a local repository', async () => {
    const bridge = createBridge({ layout, root: fixture.root })
    const synced = await bridge.bundleGrepSync([fixture.repo, fixture.repo])
    expect(synced).toEqual({ ok: true, value: [{ type: 'synced', repo: expect.any(String), status: 'created' }] })
    const repo = synced.ok ? (synced.value[0] as { repo: string }).repo : ''

    expect(await bridge.bundleGrepListRepos()).toMatchObject({
      ok: true,
      value: { repos: [{ name: repo, state: 'ready', metadata: { defaultBranch: 'main' } }], invalid: [] },
    })

    rmSync(join(layout.cacheDir), { recursive: true, force: true })
    expect(await bridge.bundleGrepListRepos()).toMatchObject({ value: { repos: [{ name: repo, state: 'unrestored' }] } })
    expect(await bridge.bundleGrepRestore()).toEqual({ ok: true, value: [{ type: 'restored', repo, status: 'created' }] })
  })

  test('a source that cannot be resolved is a failed item, not a failed call', async () => {
    const bridge = createBridge({ layout, root: fixture.root, gh: join(fixture.root, 'no-such-gh') })
    expect(await bridge.bundleGrepSync(['some-owner'])).toMatchObject({
      ok: true,
      value: [{ type: 'failed', subject: 'some-owner', error: { _tag: 'GhError' } }],
    })
  })

  test('only one sync or restore runs at a time', async () => {
    const bridge = createBridge({ layout, root: fixture.root })
    const [first, second] = await Promise.all([bridge.bundleGrepRestore(), bridge.bundleGrepSync([fixture.repo])])
    expect(first.ok).toBe(true)
    expect(second).toMatchObject({ ok: false, error: { _tag: 'BusyError' } })
    expect((await bridge.bundleGrepSync([fixture.repo])).ok).toBe(true)
  })

  test('errors keep only their tag and message', async () => {
    const bridge = createBridge({ layout, root: fixture.root })
    const synced = await bridge.bundleGrepSync(['/no/such/repo'])
    expect(synced).toMatchObject({ ok: true, value: [{ type: 'failed', error: { _tag: 'GitError' } }] })
    const failed = synced.ok ? synced.value[0] : undefined
    expect(failed?.type === 'failed' && Object.keys(failed.error).sort()).toEqual(['_tag', 'message'])
  })
})
