import { describe, expect, test } from 'vitest'
import { join } from 'node:path'

import { createFixtureRepo, runGit, type FixtureCommit } from './fixture'

describe('git capabilities the search depends on', () => {
  const commits: FixtureCommit[] = [
    {
      message: 'init',
      files: {
        'src/number.ts': 'export function getRandomValue(): number {\n  return 4\n}\n',
        'src/group.ts': 'import { atom } from "jotai"\nexport const group = atom([])\n',
        'vendor/lib.js': 'function getRandomValue() {}\n',
      },
    },
    { message: 'drop vendor', files: { 'vendor/lib.js': null } },
  ]

  test('a bundle records the complete history', () => {
    using fixture = createFixtureRepo(commits)

    expect(fixture.git('bundle', 'verify', fixture.bundle)).toContain('complete history')
    expect(fixture.git('bundle', 'list-heads', fixture.bundle)).toContain('refs/heads/main')
  })

  test('git grep searches a bare clone of a bundle without a work tree', () => {
    using fixture = createFixtureRepo(commits)
    const bare = join(fixture.root, 'repo.git')
    runGit(fixture.root, ['clone', '--quiet', '--bare', fixture.bundle, bare])

    expect(runGit(bare, ['grep', '-n', 'getRandomValue', 'HEAD'])).toBe(
      'HEAD:src/number.ts:1:export function getRandomValue(): number {',
    )
  })

  test('git grep supports PCRE', () => {
    using fixture = createFixtureRepo(commits)

    expect(fixture.git('grep', '-P', '-l', 'function\\s+\\w+\\(', 'HEAD')).toBe('HEAD:src/number.ts')
  })

  test('glob and exclude pathspecs narrow the search', () => {
    using fixture = createFixtureRepo(commits)

    expect(fixture.git('grep', '-l', 'export', 'HEAD', '--', ':(glob)src/**/*.ts', ':!src/group.ts')).toBe(
      'HEAD:src/number.ts',
    )
  })

  test('--all-match keeps only files containing every pattern', () => {
    using fixture = createFixtureRepo(commits)

    expect(fixture.git('grep', '-l', '--all-match', '-e', 'atom', '-e', 'group', 'HEAD')).toBe(
      'HEAD:src/group.ts',
    )
  })

  test('git log -G finds code deleted from HEAD', () => {
    using fixture = createFixtureRepo(commits)

    expect(fixture.git('log', '--format=%s', '-G', 'getRandomValue', '--', 'vendor')).toBe(
      'drop vendor\ninit',
    )
  })
})
