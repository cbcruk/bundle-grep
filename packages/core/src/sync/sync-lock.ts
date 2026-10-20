/**
 * Keeps two syncs from updating one repository at once.
 *
 * @module
 */

import { Result } from 'better-result'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { FileSystemError } from '../archive/archive.errors'
import { SyncLockedError } from './sync.errors'

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function holder(path: string): Promise<number | null> {
  const text = await readFile(path, 'utf8').catch(() => '')
  const pid = Number.parseInt(text, 10)
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null
}

/**
 * Takes the lock file at a path, recording this process's id in it.
 *
 * A lock left by a process that is no longer running is taken over, so a
 * killed sync does not block the next one. A lock without a readable process
 * id is treated as held.
 *
 * @returns A handle whose disposal releases the lock, or
 * {@linkcode SyncLockedError} when a running process holds it.
 */
export async function acquireSyncLock(path: string): Promise<Result<AsyncDisposable, SyncLockedError | FileSystemError>> {
  const failed = (error: unknown): FileSystemError =>
    new FileSystemError({ path, message: `Cannot lock ${path}: ${error instanceof Error ? error.message : String(error)}` })
  try {
    await mkdir(dirname(path), { recursive: true })
  } catch (error) {
    return Result.err(failed(error))
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await writeFile(path, `${process.pid}\n`, { flag: 'wx' })
      return Result.ok({ [Symbol.asyncDispose]: () => rm(path, { force: true }) })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return Result.err(failed(error))
    }
    const pid = await holder(path)
    if (attempt > 0 || pid === null || isAlive(pid)) {
      return Result.err(
        new SyncLockedError({
          path,
          pid,
          message: `Another sync${pid === null ? '' : ` (process ${pid})`} is updating this repository; remove ${path} if none is running`,
        }),
      )
    }
    await rm(path, { force: true })
  }
}
