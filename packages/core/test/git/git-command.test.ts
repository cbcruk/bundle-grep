import { describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'

import { resolveGitCommand } from '../../src/git/git-command'

describe('resolveGitCommand', () => {
  test('leaves git to the operating system off macOS', async () => {
    expect(await resolveGitCommand('linux', '/usr/bin')).toBe('git')
  })

  test('leaves git to the operating system when PATH has no git', async () => {
    expect(await resolveGitCommand('darwin', '')).toBe('git')
  })

  test.runIf(process.platform === 'darwin')('runs the developer tools git instead of the /usr/bin/git shim', async () => {
    const real = spawnSync('xcrun', ['--find', 'git'], { encoding: 'utf8' }).stdout.trim()
    expect(await resolveGitCommand('darwin', '/usr/bin:/bin')).toBe(real)
    expect(await resolveGitCommand('darwin', `${dirname(real)}:/usr/bin`)).toBe('git')
  })
})
