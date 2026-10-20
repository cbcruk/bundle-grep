/**
 * Keeps two runs from updating one repository's cache at once.
 *
 * @module
 */

import { Result } from 'better-result'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { uptime } from 'node:os'
import { dirname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { FileSystemError, RepoLockedError } from './archive.errors'

/** How far two readings of the boot time may differ and still name the same boot. */
const BOOT_TOLERANCE_MS = 5 * 60 * 1000

interface Holder {
  pid: number
  boot: number
}

function bootTime(): number {
  return Date.now() - uptime() * 1000
}

function parseHolder(text: string): Holder | null {
  const [pid, boot] = text.trim().split(' ')
  const parsed = { pid: Number(pid), boot: Number(boot) }
  return Number.isSafeInteger(parsed.pid) && parsed.pid > 0 && Number.isFinite(parsed.boot) ? parsed : null
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * A lock is stale when its process is gone, or the machine has rebooted since it was taken.
 *
 * The cache is local, so the process is looked up on this machine.
 */
function isStale(holder: Holder | null): boolean {
  if (holder === null) return false
  return Math.abs(holder.boot - bootTime()) > BOOT_TOLERANCE_MS || !isAlive(holder.pid)
}

const read = (path: string): Promise<string | null> => readFile(path, 'utf8').catch(() => null)

/** A takeover guard older than this was left by a run that died while holding it. */
const GUARD_STALE_MS = 10 * 1000

/**
 * Removes a stale lock, unless another run has replaced it in the meantime.
 *
 * Takeovers are serialised by a guard file beside the lock, and the lock is
 * read again under the guard, so a run that judged the lock stale cannot
 * remove one that another run has just taken.
 */
async function takeOver(path: string, stale: string): Promise<void> {
  const guard = `${path}.takeover`
  try {
    await writeFile(guard, '', { flag: 'wx' })
  } catch {
    const age = await stat(guard).then(
      ({ mtimeMs }) => Date.now() - mtimeMs,
      () => 0,
    )
    if (age > GUARD_STALE_MS) await rm(guard, { force: true }).catch(() => undefined)
    return
  }
  try {
    if ((await read(path)) === stale) await rm(path, { force: true })
  } finally {
    await rm(guard, { force: true }).catch(() => undefined)
  }
}

/**
 * Takes the lock file at a path, recording this process and boot in it.
 *
 * A lock left by a process that is gone, or from before the machine last
 * booted, is taken over, so a killed or interrupted run does not block the
 * next one. A lock that cannot be read is treated as held. Releasing removes the file only while it is still this
 * lock.
 *
 * @returns A handle whose disposal releases the lock, or
 * {@linkcode RepoLockedError} when another run holds it.
 */
export async function acquireRepoLock(path: string): Promise<Result<AsyncDisposable, RepoLockedError | FileSystemError>> {
  const failed = (error: unknown): FileSystemError =>
    new FileSystemError({ path, message: `Cannot lock ${path}: ${error instanceof Error ? error.message : String(error)}` })
  const token = `${process.pid} ${Math.round(bootTime())} ${randomUUID()}\n`
  const release = async (): Promise<void> => {
    if ((await read(path)) === token) await rm(path, { force: true }).catch(() => undefined)
  }

  try {
    await mkdir(dirname(path), { recursive: true })
  } catch (error) {
    return Result.err(failed(error))
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(10 * attempt)
    try {
      await writeFile(path, token, { flag: 'wx' })
      return Result.ok({ [Symbol.asyncDispose]: release })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return Result.err(failed(error))
    }
    const text = await read(path)
    if (text === null) continue
    if (!isStale(parseHolder(text))) break
    await takeOver(path, text).catch(() => undefined)
  }
  const pid = parseHolder((await read(path)) ?? '')?.pid ?? null
  return Result.err(
    new RepoLockedError({
      path,
      pid,
      message: `Another sync or restore${pid === null ? '' : ` (process ${pid})`} is updating this repository; remove ${path} if none is running`,
    }),
  )
}
