import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { compileQuery } from '../../src/plan/compile-query'
import { listMatchingFiles, narrowingPathspecs } from '../../src/plan/list-matching-files'
import type { FilterLeaf } from '../../src/plan/plan.types'
import { specializePlan } from '../../src/plan/specialize-plan'
import { parseQuery } from '../../src/query/parse-query'
import { createFixtureRepo, runGit, type FixtureRepo } from '../fixture'

let fixture: FixtureRepo
let gitDir: string

beforeAll(() => {
  fixture = createFixtureRepo([
    {
      message: 'init',
      files: {
        'src/use-counter.ts': 'import { useState } from "react"\nexport const True = useState\n',
        'src/app.tsx': 'export function App(): null {\n  return null // TODO\n}\n',
        'src/lib/deep.js': 'const value = true\n',
        'test/use-counter.test.ts': 'import { useState } from "react"\n',
        'Dockerfile': 'FROM oven/bun\n',
        'docs/useState.md': 'Nothing to see\n',
        'image.png': '\u0000\u0001binary useState\u0000',
        'src/empty.ts': '',
      },
    },
  ])
  gitDir = join(fixture.root, 'repo.git')
  runGit(fixture.root, ['clone', '--quiet', '--bare', fixture.bundle, gitDir])
})

afterAll(() => fixture[Symbol.dispose]())

async function search(query: string, holds: (filter: FilterLeaf) => boolean = () => true): Promise<string[]> {
  const plan = parseQuery(query).andThen(compileQuery).unwrap()
  const files = await listMatchingFiles({ gitDir, expr: specializePlan(plan.expr, holds) })
  return files.unwrap()
}

describe('listMatchingFiles', () => {
  test('a bare term matches contents and paths, case-insensitively, skipping binaries', async () => {
    expect(await search('usestate')).toEqual(['docs/useState.md', 'src/use-counter.ts', 'test/use-counter.test.ts'])
  })

  test('content: ignores paths', async () => {
    expect(await search('content:useState')).toEqual(['src/use-counter.ts', 'test/use-counter.test.ts'])
  })

  test('NOT excludes', async () => {
    expect(await search('content:useState NOT path:test')).toEqual(['src/use-counter.ts'])
  })

  test('OR unites', async () => {
    expect(await search('content:TODO OR content:oven')).toEqual(['Dockerfile', 'src/app.tsx'])
  })

  test('AND of contents needs every pattern in the same file', async () => {
    expect(await search('content:import content:True')).toEqual(['src/use-counter.ts'])
  })

  test('a regex can turn case-insensitivity off', async () => {
    expect(await search('content:/(?-i)True/')).toEqual(['src/use-counter.ts'])
    expect(await search('content:/true/')).toEqual(['src/lib/deep.js', 'src/use-counter.ts'])
  })

  test('path globs follow GitHub', async () => {
    expect(await search('path:*.ts')).toEqual(['src/empty.ts', 'src/use-counter.ts', 'test/use-counter.test.ts'])
    expect(await search('path:/src/*.ts*')).toEqual(['src/app.tsx', 'src/empty.ts', 'src/use-counter.ts'])
    expect(await search('path:/src/**/*.js')).toEqual(['src/lib/deep.js'])
  })

  test('language: matches extensions and filenames', async () => {
    expect(await search('language:typescript')).toEqual(['src/empty.ts', 'src/use-counter.ts', 'test/use-counter.test.ts'])
    expect(await search('language:dockerfile')).toEqual(['Dockerfile'])
    expect(await search('useState language:typescript NOT path:test')).toEqual(['src/use-counter.ts'])
  })

  test('a repository qualifier that does not hold matches nothing', async () => {
    expect(await search('useState repo:a/b', () => false)).toEqual([])
    expect(await search('content:FROM OR repo:a/b', () => true)).toHaveLength(7)
  })

  test('binary files match nothing, not even NOT or path:', async () => {
    expect(await search('NOT content:zzzz')).not.toContain('image.png')
    expect(await search('path:*.png')).toEqual([])
  })

  test('empty files are part of the tree', async () => {
    expect(await search('path:empty')).toEqual(['src/empty.ts'])
  })

  test('a path regex can be case-sensitive', async () => {
    expect(await search('path:/(?-i)usestate/')).toEqual([])
    expect(await search('path:/(?-i)useState/')).toEqual(['docs/useState.md'])
  })

  test.each(['color.ui', 'color.grep'])("the user's %s=always does not leak into parsed output", async key => {
    runGit(gitDir, ['config', key, 'always'])
    try {
      expect(await search('content:useState NOT path:test')).toEqual(['src/use-counter.ts'])
      expect(await search('NOT content:zzzz')).toContain('src/empty.ts')
    } finally {
      runGit(gitDir, ['config', '--unset', key])
    }
  })

  test('a git failure is a value', async () => {
    const plan = parseQuery('content:x').andThen(compileQuery).unwrap()
    const result = await listMatchingFiles({ gitDir, expr: specializePlan(plan.expr, () => true), ref: 'missing' })
    expect(result.isErr()).toBe(true)
  })
})

describe('narrowingPathspecs', () => {
  test('from a top-level language', async () => {
    const plan = parseQuery('foo language:typescript').andThen(compileQuery).unwrap()
    expect(narrowingPathspecs(specializePlan(plan.expr, () => true))).toEqual([
      ':(glob,icase)**/*.ts',
      ':(glob,icase)**/*.cts',
      ':(glob,icase)**/*.mts',
    ])
  })

  test('not from a language under OR with a term', async () => {
    const plan = parseQuery('foo OR language:typescript').andThen(compileQuery).unwrap()
    expect(narrowingPathspecs(specializePlan(plan.expr, () => true))).toEqual([])
  })
})

describe('telling text from binary files', () => {
  test('works for a few named files, names that look like globs, and more files than are named one by one', async () => {
    const files: Record<string, string> = { 'a*b.txt': 'star\n', '[x].txt': 'bracket\n', 'bin[1].dat': 'x\u0000y' }
    for (let index = 0; index < 1100; index++) files[`many/f${index}.txt`] = `${index}\n`
    files['many/blob.bin'] = '\u0000'
    using many = createFixtureRepo([{ message: 'many', files }])
    const dir = join(many.root, 'repo.git')
    runGit(many.root, ['clone', '--quiet', '--bare', many.bundle, dir])
    const list = async (query: string): Promise<string[]> => {
      const plan = parseQuery(query).andThen(compileQuery).unwrap()
      return (await listMatchingFiles({ gitDir: dir, expr: specializePlan(plan.expr, () => true) })).unwrap()
    }
    expect(await list('path:/[*[]/')).toEqual(['[x].txt', 'a*b.txt'])
    const all = await list('path:many')
    expect(all).toHaveLength(1100)
    expect(all).not.toContain('many/blob.bin')
  })
})

const IDENTITY = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'a',
  GIT_AUTHOR_EMAIL: 'a@example.com',
  GIT_COMMITTER_NAME: 'a',
  GIT_COMMITTER_EMAIL: 'a@example.com',
}

describe('telling text from binary files, as git does', () => {
  test('a name that is not valid UTF-8 is still found by path:, NOT, and language:', async () => {
    using odd = createFixtureRepo([{ message: 'init', files: { 'ok.txt': 'hello\n' } }])
    const dir = join(odd.root, 'repo.git')
    runGit(odd.root, ['clone', '--quiet', '--bare', odd.bundle, dir])
    const git = (args: string[], input?: string | Buffer): string =>
      execFileSync('git', args, { cwd: dir, env: { ...process.env, ...IDENTITY }, input }).toString().trim()
    const oid = git(['hash-object', '-w', '--stdin'], 'hello\n')
    const name = Buffer.concat([Buffer.from('caf'), Buffer.from([0xe9]), Buffer.from('.txt')])
    const listing = Buffer.concat([Buffer.from(`100644 blob ${oid}\t`), name, Buffer.from(`\n100644 blob ${oid}\tok.txt\n`)])
    const commit = git(['commit-tree', git(['mktree'], listing), '-m', 'odd'])
    const list = async (query: string): Promise<string[]> => {
      const plan = parseQuery(query).andThen(compileQuery).unwrap()
      return (await listMatchingFiles({ gitDir: dir, ref: commit, expr: specializePlan(plan.expr, () => true) })).unwrap()
    }
    for (const query of ['path:txt', 'NOT zzz', 'language:text', 'hello']) expect(await list(query)).toHaveLength(2)
  })

  test('a file git treats as binary through attributes is left out of symbol: answers too', async () => {
    mkdirSync(join(gitDir, 'info'), { recursive: true })
    writeFileSync(join(gitDir, 'info', 'attributes'), 'src/use-counter.ts binary\n')
    try {
      expect(await search('symbol:True path:src')).toEqual([])
      expect(await search('content:useState')).toEqual(['test/use-counter.test.ts'])
    } finally {
      rmSync(join(gitDir, 'info', 'attributes'))
    }
  })
})
