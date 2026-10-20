import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir, uptime } from 'node:os'
import { join } from 'node:path'

import { acquireRepoLock } from '../../src/archive/repo-lock'

function lockPath(): { path: string; [Symbol.dispose]: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'repo-lock-'))
  return { path: join(dir, 'owner', 'name.git.lock'), [Symbol.dispose]: () => rmSync(dir, { recursive: true, force: true }) }
}

const boot = (): number => Math.round(Date.now() - uptime() * 1000)

describe('acquireRepoLock', () => {
  test('holds the lock until released, and refuses it meanwhile', async () => {
    using lock = lockPath()
    {
      await using _held = (await acquireRepoLock(lock.path)).unwrap()
      expect(readFileSync(lock.path, 'utf8')).toStartWith(`${process.pid} ${hostname()} `)
      const second = await acquireRepoLock(lock.path)
      expect(second.isErr() && second.error).toMatchObject({ _tag: 'RepoLockedError', pid: process.pid })
    }
    expect(existsSync(lock.path)).toBe(false)
    await using _again = (await acquireRepoLock(lock.path)).unwrap()
  })

  test('takes over a lock whose process is gone, or from before the last boot', async () => {
    using lock = lockPath()
    const gone = Bun.spawnSync(['true']).pid
    ;(await acquireRepoLock(lock.path)).unwrap()

    writeFileSync(lock.path, `${gone} ${hostname()} ${boot()} x\n`)
    {
      await using _held = (await acquireRepoLock(lock.path)).unwrap()
    }

    writeFileSync(lock.path, `${process.pid} ${hostname()} ${boot() - 24 * 60 * 60 * 1000} x\n`)
    {
      await using _held = (await acquireRepoLock(lock.path)).unwrap()
    }
    expect(existsSync(lock.path)).toBe(false)
  })

  test('treats a lock from another host, or one it cannot read, as held', async () => {
    using lock = lockPath()
    ;(await acquireRepoLock(lock.path)).unwrap()

    for (const text of [`${Bun.spawnSync(['true']).pid} elsewhere.example ${boot()} x\n`, 'not a lock\n']) {
      writeFileSync(lock.path, text)
      const result = await acquireRepoLock(lock.path)
      expect(result.isErr() && result.error._tag).toBe('RepoLockedError')
      expect(readFileSync(lock.path, 'utf8')).toBe(text)
    }
  })

  test('lets only one of several runs take over the same stale lock', async () => {
    using lock = lockPath()
    const gone = Bun.spawnSync(['true']).pid
    ;(await acquireRepoLock(lock.path)).unwrap()

    for (let trial = 0; trial < 50; trial++) {
      writeFileSync(lock.path, `${gone} ${hostname()} ${boot()} x\n`)
      const results = await Promise.all(Array.from({ length: 4 }, () => acquireRepoLock(lock.path)))
      const held = results.filter(result => result.isOk())
      expect(held).toHaveLength(1)
      await held[0]!.value[Symbol.asyncDispose]()
    }
  })

  test('leaves a lock alone on release once another run has replaced it', async () => {
    using lock = lockPath()
    const held = (await acquireRepoLock(lock.path)).unwrap()
    writeFileSync(lock.path, 'someone else\n')

    await held[Symbol.asyncDispose]()

    expect(readFileSync(lock.path, 'utf8')).toBe('someone else\n')
  })
})
