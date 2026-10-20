import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { catBlobs } from '../../src/git/cat-blobs'
import { GitError } from '../../src/git/git.errors'
import { symbolIndex } from '../../src/symbols/symbol-index'
import type { SymbolIndex } from '../../src/symbols/symbols.types'
import { createFixtureRepo, runGit, type FixtureRepo } from '../fixture'

let fixture: FixtureRepo
let gitDir: string
const indexFile = (): string => join(gitDir, 'bundle-grep-symbols.json')

function summary(index: SymbolIndex): Record<string, string[]> {
  return Object.fromEntries([...index.files].map(([path, file]) => [path, file.symbols.map(symbol => `${symbol.name}:${symbol.line}`)]))
}

function commit(files: Record<string, string>, message: string): void {
  for (const [path, contents] of Object.entries(files)) writeFileSync(join(fixture.repo, path), contents)
  fixture.git('add', '--all')
  fixture.git('commit', '--quiet', '--message', message)
  runGit(gitDir, ['fetch', '--quiet', fixture.repo, '+refs/heads/*:refs/heads/*'])
}

beforeAll(() => {
  fixture = createFixtureRepo([
    {
      message: 'init',
      files: {
        'src/a.ts': 'export function alpha(): void {}\n',
        'src/b.py': 'def beta():\n    pass\n',
        'README.md': '# alpha\n',
        'big.ts': `function huge() {}\n${'//\n'.repeat(512 * 1024)}`,
        'bin.ts': 'function hidden() {}\0\n',
      },
    },
  ])
  symlinkSync('src/a.ts', join(fixture.repo, 'link.ts'))
  fixture.git('add', '--all')
  fixture.git('commit', '--quiet', '--message', 'link')
  gitDir = join(fixture.root, 'repo.git')
  runGit(fixture.root, ['clone', '--quiet', '--bare', fixture.repo, gitDir])
})

afterAll(() => fixture[Symbol.dispose]())

describe('symbolIndex', () => {
  test('indexes the files a grammar covers, leaving out large, binary, and linked ones', async () => {
    const index = (await symbolIndex(gitDir)).unwrap()
    expect(index.commit).toBe(fixture.git('rev-parse', 'HEAD'))
    expect(summary(index)).toEqual({ 'bin.ts': [], 'src/a.ts': ['alpha:1'], 'src/b.py': ['beta:1'] })
  })

  test('a current index is read back rather than rebuilt', async () => {
    const stored = JSON.parse(readFileSync(indexFile(), 'utf8')) as { files: Record<string, [string, unknown[]]> }
    stored.files['src/a.ts']![1] = [['planted', 'function', 9, 0]]
    writeFileSync(indexFile(), JSON.stringify(stored))
    expect(summary((await symbolIndex(gitDir)).unwrap())['src/a.ts']).toEqual(['planted:9'])
  })

  test('a new commit parses only the files that changed', async () => {
    commit({ 'src/b.py': 'def gamma():\n    pass\n', 'src/c.go': 'package c\n\nfunc Delta() {}\n' }, 'change')
    const index = (await symbolIndex(gitDir)).unwrap()
    expect(index.commit).toBe(fixture.git('rev-parse', 'HEAD'))
    expect(summary(index)).toEqual({
      'bin.ts': [],
      'src/a.ts': ['planted:9'],
      'src/b.py': ['gamma:1'],
      'src/c.go': ['Delta:3'],
    })
  })

  test('an unreadable index is rebuilt', async () => {
    writeFileSync(indexFile(), '{"version":1,')
    expect(summary((await symbolIndex(gitDir)).unwrap())['src/a.ts']).toEqual(['alpha:1'])
    writeFileSync(indexFile(), JSON.stringify({ version: 1, indexer: 'other', commit: fixture.git('rev-parse', 'HEAD'), files: {} }))
    expect(summary((await symbolIndex(gitDir)).unwrap())['src/a.ts']).toEqual(['alpha:1'])
    const stored = JSON.parse(readFileSync(indexFile(), 'utf8')) as { commit: string; files: Record<string, unknown> }
    for (const files of [{ 'src/a.ts': 5 }, { 'src/a.ts': ['x', 5] }]) {
      writeFileSync(indexFile(), JSON.stringify({ ...stored, commit: 'old', files }))
      expect(summary((await symbolIndex(gitDir)).unwrap())['src/a.ts']).toEqual(['alpha:1'])
    }
  })

  test('another ref can be indexed', async () => {
    const index = (await symbolIndex(gitDir, { ref: 'HEAD~1' })).unwrap()
    expect(summary(index)['src/b.py']).toEqual(['beta:1'])
    const missing = await symbolIndex(gitDir, { ref: 'nope' })
    expect(missing.isErr() && missing.error).toBeInstanceOf(GitError)
  })
})

describe('catBlobs', () => {
  test('streams every blob, however it is split, and skips missing ones', async () => {
    const big = fixture.git('rev-parse', 'HEAD:big.ts')
    const small = fixture.git('rev-parse', 'HEAD:src/a.ts')
    const seen: [string, number][] = []
    const read = await catBlobs(gitDir, [big, '0'.repeat(40), small, big], (oid, content) => seen.push([oid, content.length]))
    expect(read.isOk()).toBe(true)
    expect(seen).toEqual([
      [big, 19 + 3 * 512 * 1024],
      [small, 33],
      [big, 19 + 3 * 512 * 1024],
    ])
  })

  test('nothing to read runs nothing', async () => {
    expect((await catBlobs(join(fixture.root, 'missing'), [], () => undefined)).isOk()).toBe(true)
  })
})
