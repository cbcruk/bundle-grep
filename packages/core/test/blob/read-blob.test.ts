import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { readBlob } from '../../src/blob/read-blob'
import { createFixtureRepo, runGit, type FixtureRepo } from '../fixture'

let fixture: FixtureRepo
let gitDir: string

beforeAll(() => {
  fixture = createFixtureRepo([
    { message: 'init', files: { 'a*': 'star\n', ab: 'plain\n', 'dir/b.txt': 'nested\n', 'big.txt': 'x'.repeat(100) } },
  ])
  gitDir = join(fixture.root, 'repo.git')
  runGit(fixture.root, ['clone', '--quiet', '--bare', fixture.bundle, gitDir])
})

afterAll(() => fixture[Symbol.dispose]())

async function read(path: string, maxBytes?: number): Promise<string> {
  const blob = await readBlob({ gitDir, ref: 'HEAD', path, maxBytes })
  return blob.isOk() ? new TextDecoder().decode(blob.value) : blob.error._tag
}

describe('readBlob', () => {
  test('reads a file at the root or in a directory', async () => {
    expect(await read('ab')).toBe('plain\n')
    expect(await read('dir/b.txt')).toBe('nested\n')
  })

  test('paths are literal, not pathspecs', async () => {
    expect(await read('a*')).toBe('star\n')
    expect(await read('a?')).toBe('BlobNotFoundError')
    expect(await read(':(glob)a*')).toBe('BlobNotFoundError')
  })

  test('a directory or a prefix of a path is not a file', async () => {
    expect(await read('dir')).toBe('BlobNotFoundError')
    expect(await read('dir/')).toBe('BlobNotFoundError')
    expect(await read('di')).toBe('BlobNotFoundError')
  })

  test('the size is checked before reading', async () => {
    expect(await read('big.txt', 100)).toHaveLength(100)
    expect(await read('big.txt', 99)).toBe('BlobTooLargeError')
  })

  test('an unknown ref is a GitError', async () => {
    const blob = await readBlob({ gitDir, ref: 'nope', path: 'ab' })
    expect(blob.isErr() && blob.error._tag).toBe('GitError')
  })
})
