import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { createFixtureRepo, isolateGitConfig, type FixtureRepo } from '../../core/test/fixture'
import type { Io } from '../src/cli.types'
import { run } from '../src/run'

isolateGitConfig()

interface Ran {
  code: number
  stdout: string
  stderr: string
}

let fixture: FixtureRepo
let root: string
let gh: string

function ghRepo(owner: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    owner: { login: owner },
    url: fixture.repo,
    isFork: false,
    isArchived: false,
    isPrivate: false,
    primaryLanguage: { name: 'TypeScript' },
    description: '',
    pushedAt: '2026-10-01T00:00:00Z',
    ...extra,
  }
}

async function cli(...argv: string[]): Promise<Ran> {
  return cliWith({}, ...argv)
}

async function cliWith(extra: Partial<Io>, ...argv: string[]): Promise<Ran> {
  let stdout = ''
  let stderr = ''
  const io: Io = {
    write: text => void (stdout += text),
    error: text => void (stderr += text),
    env: { BUNDLE_GREP_ROOT: root },
    color: false,
    errorColor: false,
    interactive: false,
    gh,
    ...extra,
  }
  const code = await run(argv, io)
  return { code, stdout, stderr }
}

beforeAll(async () => {
  fixture = createFixtureRepo([
    {
      message: 'init',
      files: {
        'src/counter.ts': 'import { useState } from "react"\n\nexport const n = useState(0)\n',
        'README.md': '# Counter\n',
        'gap.txt': 'mark\n1\n2\n3\nmark\n',
      },
    },
  ])
  root = join(fixture.root, 'home')
  gh = join(fixture.root, 'gh')
  writeFileSync(join(fixture.root, 'list.json'), JSON.stringify([ghRepo('acme', 'app'), ghRepo('acme', 'fork', { isFork: true })]))
  writeFileSync(join(fixture.root, 'view.json'), JSON.stringify(ghRepo('Other', 'tool', { isArchived: true })))
  writeFileSync(gh, `#!/bin/sh\ncase "$2" in list) cat '${fixture.root}/list.json' ;; *) cat '${fixture.root}/view.json' ;; esac\n`)
  chmodSync(gh, 0o755)

  expect(await cli('sync', 'acme', 'other/tool', fixture.repo)).toEqual({
    code: 0,
    stdout: `created   acme/app\ncreated   acme/fork\ncreated   Other/tool\ncreated   ${fixture.root.split('/').at(-1)}/repo\n`,
    stderr: '',
  })
})

afterAll(() => fixture[Symbol.dispose]())

describe('bundle-grep', () => {
  test('prints help, and fails on an unknown command', async () => {
    expect((await cli('--help')).stdout).toContain('Commands:')
    const unknown = await cli('frobnicate')
    expect(unknown.code).toBe(2)
    expect(unknown.stderr).toStartWith('Unknown command "frobnicate"')
    expect((await cli()).code).toBe(2)
  })

  test('sync reports unchanged repositories on a second run', async () => {
    const again = await cli('sync', 'acme')
    expect(again).toEqual({ code: 0, stdout: 'unchanged acme/app\nunchanged acme/fork\n', stderr: '' })
  })

  test('sync --json prints one object per repository, and fails for a source it cannot resolve', async () => {
    const synced = await cli('sync', '--json', 'acme', '/')
    expect(synced.code).toBe(1)
    expect(synced.stdout.trimEnd().split('\n').map(line => JSON.parse(line))).toEqual([
      { type: 'failed', source: '/', error: expect.stringContaining('owner and name') },
      { type: 'synced', repo: 'acme/app', status: 'unchanged' },
      { type: 'synced', repo: 'acme/fork', status: 'unchanged' },
    ])
  })

  test('search groups matches by repository as path:line:column:text', async () => {
    const found = await cli('search', 'useState', 'repo:acme/app')
    expect(found).toEqual({
      code: 0,
      stdout: 'acme/app\nsrc/counter.ts:1:10:import { useState } from "react"\nsrc/counter.ts:3:18:export const n = useState(0)\n',
      stderr: '1 file in 1 repository\n',
    })
  })

  test('search honours repository qualifiers', async () => {
    const forks = await cli('search', 'useState -is:fork -is:archived org:acme')
    expect(forks.stdout.split('\n').filter(line => !line.includes(':'))).toEqual(['acme/app', ''])
    const archived = await cli('search', 'useState is:archived')
    expect(archived.stdout).toStartWith('Other/tool\n')
  })

  test('search shows context, limits files, and exits 1 when nothing matches', async () => {
    const context = await cli('search', '-C', '1', 'export repo:acme/app')
    expect(context.stdout).toBe('acme/app\nsrc/counter.ts-2-\nsrc/counter.ts:3:1:export const n = useState(0)\n')
    const separated = await cli('search', '-C', '0', 'useState repo:acme/app')
    expect(separated.stdout).not.toContain('--')
    const gap = await cli('search', '-C', '1', 'mark repo:acme/app')
    expect(gap.stdout).toBe('acme/app\ngap.txt:1:1:mark\ngap.txt-2-1\n--\ngap.txt-4-3\ngap.txt:5:1:mark\n')

    const limited = await cli('search', '--limit', '1', 'useState')
    expect(limited.stdout.split('\n').filter(line => line.startsWith('src/counter.ts:1:'))).toHaveLength(1)
    expect(limited.stderr).toBe('4 files in 4 repositories, showing 1; raise --limit for more\n')

    expect(await cli('search', 'nothing-here-at-all')).toEqual({ code: 1, stdout: '', stderr: '0 files in 0 repositories\n' })
  })

  test('search prints a path-only match as just the path', async () => {
    expect((await cli('search', 'path:README repo:acme/app')).stdout).toBe('acme/app\nREADME.md\n')
  })

  test('search --json prints the events', async () => {
    const found = await cli('search', '--json', 'useState repo:acme/app')
    const events = found.stdout.trimEnd().split('\n').map(line => JSON.parse(line))
    expect(events.map(event => event.type)).toEqual(['file', 'done'])
    expect(events[0]).toMatchObject({ repo: 'acme/app', path: 'src/counter.ts', language: 'TypeScript' })
    expect(events[0].lines[0]).toMatchObject({ number: 1, column: 9, ranges: [{ start: 9, end: 17 }] })
  })

  test('search points at a query error', async () => {
    expect(await cli('search', 'x language:nope')).toEqual({
      code: 2,
      stdout: '',
      stderr: 'error: Unknown language "nope"\n  x language:nope\n    ^^^^^^^^^^^^^\n',
    })
    expect((await cli('search', '한글 (')).stderr).toEndWith('  한글 (\n        ^\n')
  })

  test('search rejects bad numbers and missing queries', async () => {
    const bad = await cli('search', '--limit', 'ten', 'x')
    expect(bad.code).toBe(2)
    expect(bad.stderr).toStartWith('--limit must be a whole number of at least 0, not "ten"')
    expect((await cli('search')).code).toBe(2)
    expect((await cli('search', '--nope', 'x')).code).toBe(2)
  })

  test('list shows each repository with its state and metadata', async () => {
    const listed = await cli('list')
    expect(listed.code).toBe(0)
    expect(listed.stdout.split('\n')[0]).toMatch(/^Other\/tool\s+ready\s+TypeScript {2}archived {2}synced \d{4}-\d\d-\d\d$/)
    expect(listed.stdout).toMatch(/acme\/fork\s+ready\s+TypeScript {2}fork {2}synced/)
  })

  test('restore rebuilds deleted caches, which search then finds again', async () => {
    rmSync(join(root, 'cache', 'acme'), { recursive: true })
    const before = await cli('search', 'useState org:acme')
    expect(before.code).toBe(1)
    expect(before.stderr).toStartWith('warning: 2 repositories have no search cache; run `bundle-grep restore` to search them\n')
    expect((await cli('list', '--json')).stdout).toContain('"state": "unrestored"')
    expect((await cli('list')).stdout).toMatch(/acme\/app\s+unrestored  TypeScript  synced/)

    expect(await cli('restore', 'ACME', 'nobody')).toEqual({
      code: 1,
      stdout: 'created   acme/app\ncreated   acme/fork\n',
      stderr: 'warning: nothing archived matches nobody\n',
    })
    expect((await cli('restore', '--json', 'acme/app')).stdout).toBe('{"type":"restored","repo":"acme/app","status":"unchanged"}\n')
    expect((await cli('search', 'useState org:acme')).code).toBe(0)
  })

  test('sync resolves relative paths against the working directory', async () => {
    const cwd = process.cwd()
    process.chdir(fixture.root)
    const synced = await cli('sync', './repo').finally(() => process.chdir(cwd))
    expect(synced).toEqual({ code: 0, stdout: `unchanged ${fixture.root.split('/').at(-1)}/repo\n`, stderr: '' })
  })

  test('sync reads a bare name as a GitHub owner even when a directory has that name', async () => {
    const cwd = process.cwd()
    mkdirSync(join(fixture.root, 'acme'), { recursive: true })
    process.chdir(fixture.root)
    const synced = await cli('sync', 'acme').finally(() => process.chdir(cwd))
    expect(synced.stdout).toBe('unchanged acme/app\nunchanged acme/fork\n')
  })

  test('sync looks GitHub URLs up with gh, keeping the URL, and falls back without gh', async () => {
    const viewed = await cli('sync', 'https://github.com/other/tool')
    expect(viewed).toEqual({ code: 1, stdout: '', stderr: expect.stringContaining('failed    Other/tool:') })

    const offline = await cliWith({ gh: join(fixture.root, 'no-such-gh') }, 'sync', 'https://github.com/acme/app/tree/main')
    expect(offline.stderr).toStartWith('warning: could not look acme/app up with gh, so whether it is a fork or archived is unknown')
    expect(offline.stderr).toContain('failed    acme/app:')
  })

  test('sync keeps the first source for a repository named twice', async () => {
    const alias = join(fixture.root, 'mirror', 'acme', 'app')
    mkdirSync(dirname(alias), { recursive: true })
    symlinkSync(fixture.repo, alias)

    const synced = await cli('sync', '--json', alias, 'acme')
    expect(synced.stdout.trimEnd().split('\n').map(line => JSON.parse(line).repo)).toEqual(['acme/app', 'acme/fork'])
    expect(JSON.parse(readFileSync(join(root, 'archive', 'acme', 'app.json'), 'utf8')).url).toBe(alias)
    await cli('sync', 'acme')
  })

  test('search takes negated words without quoting or --', async () => {
    const found = await cli('search', '-is:fork', '-is:archived', 'useState', 'org:acme', '-C', '0')
    expect(found.code).toBe(0)
    expect(found.stdout).toStartWith('acme/app\n')
    for (const word of ['-hooks', '-Config', '-C1x']) {
      const searched = await cli('search', 'useState', word, 'repo:acme/app')
      expect(searched.code).toBeLessThan(2)
      expect(searched.stderr).not.toContain('Usage:')
    }
    expect((await cli('search', '-C1', 'export repo:acme/app')).stdout).toContain('src/counter.ts-2-')
    expect((await cli('search', '--nope', 'x')).code).toBe(2)
    expect((await cli('search', '--', '--x')).stderr).toBe('0 files in 0 repositories\n')
  })

  test('an aborted command exits 2', async () => {
    const controller = new AbortController()
    controller.abort()
    expect((await cliWith({ signal: controller.signal }, 'search', 'useState')).code).toBe(2)
  })

  test('search says when nothing is archived', async () => {
    const empty = await run(['search', 'x'], {
      write: () => undefined,
      error: () => undefined,
      env: { BUNDLE_GREP_ROOT: join(fixture.root, 'nowhere') },
      color: false,
      errorColor: false,
      interactive: false,
    })
    expect(empty).toBe(2)
  })
})
