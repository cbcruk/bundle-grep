import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { archivePaths, readMetadata, writeMetadata } from '../../src'
import type { RepoMetadata } from '../../src'

const METADATA: RepoMetadata = {
  version: 1,
  owner: 'acme',
  name: 'widgets',
  url: 'https://example.com/acme/widgets',
  isFork: false,
  isArchived: false,
  isPrivate: null,
  primaryLanguage: null,
  description: null,
  defaultBranch: 'main',
  head: '0'.repeat(40),
  refsDigest: 'digest',
  bundleSize: 1024,
  pushedAt: null,
  syncedAt: '2026-01-01T00:00:00.000Z',
}

function withDir(run: (dir: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-grep-archive-'))
    await run(dir).finally(() => rmSync(dir, { recursive: true, force: true }))
  }
}

describe('archivePaths', () => {
  test('places files under the owner, as absolute paths', () => {
    expect(archivePaths({ archiveDir: 'archive', cacheDir: 'cache' }, 'acme', 'widgets.js').unwrap()).toEqual({
      bundle: resolve('archive/acme/widgets.js.bundle'),
      metadata: resolve('archive/acme/widgets.js.json'),
      gitDir: resolve('cache/acme/widgets.js.git'),
    })
  })

  test.each(['.', '..', '', 'a/b', 'a\\b', 'a b'])('rejects %p', name => {
    const result = archivePaths({ archiveDir: 'archive', cacheDir: 'cache' }, 'acme', name)
    expect(result.isErr() && result.error.value).toBe(name)
  })
})

describe('metadata', () => {
  test(
    'round-trips through a file',
    withDir(async dir => {
      const path = join(dir, 'acme', 'widgets.json')
      ;(await writeMetadata(path, METADATA)).unwrap()
      expect((await readMetadata(path)).unwrap()).toEqual(METADATA)
    }),
  )

  test(
    'reads a missing file as undefined',
    withDir(async dir => {
      expect((await readMetadata(join(dir, 'none.json'))).unwrap()).toBeUndefined()
    }),
  )

  test(
    'rejects files that are not metadata',
    withDir(async dir => {
      const path = join(dir, 'bad.json')
      for (const contents of ['{', '[]', JSON.stringify({ ...METADATA, version: 2 }), JSON.stringify({ ...METADATA, head: 1 })]) {
        writeFileSync(path, contents)
        const result = await readMetadata(path)
        expect(result.isErr() && result.error._tag).toBe('FileSystemError')
      }
    }),
  )
})
