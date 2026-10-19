import { describe, expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { listGithubRepos, viewGithubRepo } from '../../src'

interface FakeGh extends Disposable {
  gh: string
  args(): string[]
}

function fakeGh(stdout: string, exitCode = 0): FakeGh {
  const root = mkdtempSync(join(tmpdir(), 'bundle-grep-gh-'))
  const gh = join(root, 'gh')
  writeFileSync(join(root, 'stdout'), stdout)
  writeFileSync(
    gh,
    `#!/bin/sh\nprintf '%s\\n' "$@" > '${root}/args'\ncat '${root}/stdout'\necho 'gh says no' >&2\nexit ${exitCode}\n`,
  )
  chmodSync(gh, 0o755)
  return {
    gh,
    args: () => readFileSync(join(root, 'args'), 'utf8').trimEnd().split('\n'),
    [Symbol.dispose]: () => rmSync(root, { recursive: true, force: true }),
  }
}

const BARLO = {
  name: 'barlo',
  owner: { id: 'x', login: 'cbcruk' },
  url: 'https://github.com/cbcruk/barlo',
  isFork: false,
  isArchived: true,
  isPrivate: false,
  primaryLanguage: { name: 'TypeScript' },
  description: 'Desktop apps with Bun',
  pushedAt: '2026-10-19T06:17:39Z',
}

describe('listGithubRepos', () => {
  test('lists repositories as sync targets', async () => {
    using fake = fakeGh(JSON.stringify([BARLO, { ...BARLO, name: 'empty', primaryLanguage: null, description: '' }]))

    const targets = (await listGithubRepos('cbcruk', { gh: fake.gh, limit: 5 })).unwrap()

    expect(targets).toEqual([
      {
        owner: 'cbcruk',
        name: 'barlo',
        url: 'https://github.com/cbcruk/barlo',
        isFork: false,
        isArchived: true,
        isPrivate: false,
        primaryLanguage: 'TypeScript',
        description: 'Desktop apps with Bun',
        pushedAt: '2026-10-19T06:17:39Z',
      },
      expect.objectContaining({ name: 'empty', primaryLanguage: null, description: null }),
    ])
    expect(fake.args()).toEqual([
      'repo',
      'list',
      '--json',
      'name,owner,url,isFork,isArchived,isPrivate,primaryLanguage,description,pushedAt',
      '--limit',
      '6',
      '--',
      'cbcruk',
    ])
  })

  test('fails rather than silently dropping repositories past the limit', async () => {
    using fake = fakeGh(JSON.stringify([BARLO, BARLO, BARLO]))

    const result = await listGithubRepos('cbcruk', { gh: fake.gh, limit: 2 })

    expect(result.isErr() && result.error.message).toBe('cbcruk has more than 2 repositories; raise the limit')
  })

  test('reports gh failing with its stderr', async () => {
    using fake = fakeGh('', 1)

    const result = await listGithubRepos('cbcruk', { gh: fake.gh })

    expect(result.isErr() && result.error.stderr).toBe('gh says no')
  })

  test.each([
    ['output that is not JSON', 'not json', 'gh printed output that is not JSON'],
    ['an object instead of a list', JSON.stringify(BARLO), 'gh printed repositories in an unexpected shape'],
    ['a repository without an owner', JSON.stringify([{ ...BARLO, owner: null }]), 'gh printed repositories in an unexpected shape'],
  ])('rejects %s', async (_, stdout, message) => {
    using fake = fakeGh(stdout)

    const result = await listGithubRepos('cbcruk', { gh: fake.gh })

    expect(result.isErr() && result.error.message).toBe(message)
  })

  test('reports a missing gh', async () => {
    const result = await listGithubRepos('cbcruk', { gh: join(tmpdir(), 'bundle-grep-no-such-gh') })

    expect(result.isErr() && result.error.message).toStartWith('Could not run gh: ')
  })
})

describe('viewGithubRepo', () => {
  test('looks up one repository', async () => {
    using fake = fakeGh(JSON.stringify(BARLO))

    const target = (await viewGithubRepo('cbcruk/barlo', { gh: fake.gh })).unwrap()

    expect(target).toMatchObject({ owner: 'cbcruk', name: 'barlo', isArchived: true })
    expect(fake.args().slice(-2)).toEqual(['--', 'cbcruk/barlo'])
  })
})
