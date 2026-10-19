import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
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
    expect(await search('path:*.ts')).toEqual(['src/use-counter.ts', 'test/use-counter.test.ts'])
    expect(await search('path:/src/*.ts*')).toEqual(['src/app.tsx', 'src/use-counter.ts'])
    expect(await search('path:/src/**/*.js')).toEqual(['src/lib/deep.js'])
  })

  test('language: matches extensions and filenames', async () => {
    expect(await search('language:typescript')).toEqual(['src/use-counter.ts', 'test/use-counter.test.ts'])
    expect(await search('language:dockerfile')).toEqual(['Dockerfile'])
    expect(await search('useState language:typescript NOT path:test')).toEqual(['src/use-counter.ts'])
  })

  test('a repository qualifier that does not hold matches nothing', async () => {
    expect(await search('useState repo:a/b', () => false)).toEqual([])
    expect(await search('content:FROM OR repo:a/b', () => true)).toHaveLength(7)
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
