/**
 * Finds the git binary to run, skipping the macOS `/usr/bin/git` shim.
 *
 * @module
 */

import { Result } from 'better-result'
import { access, constants } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

import { runProcess } from '../process/run-process'

/** The xcrun shim macOS puts on `PATH`, which looks up the developer tools on every call. */
const SHIM = '/usr/bin/git'

let cached: Promise<string> | undefined

async function firstOnPath(name: string, path: string | undefined): Promise<string | undefined> {
  for (const dir of (path ?? '').split(delimiter)) {
    if (dir === '') continue
    const candidate = join(dir, name)
    const executable = await Result.tryPromise(() => access(candidate, constants.X_OK))
    if (executable.isOk()) return candidate
  }
  return undefined
}

/**
 * Picks the git command for a platform and `PATH`.
 *
 * On macOS, when the first `git` on `PATH` is the `/usr/bin/git` shim, this is
 * the binary `xcrun --find git` names; every call through the shim pays for
 * that lookup again, which adds up over the many git runs a search makes. A
 * different git earlier on `PATH`, such as Homebrew's, is left alone.
 *
 * @param platform The operating system, as `process.platform` names it.
 * @param path A `PATH` value to search.
 * @returns An absolute path to git, or `"git"` to let the operating system find it.
 */
export async function resolveGitCommand(platform: NodeJS.Platform, path: string | undefined): Promise<string> {
  if (platform !== 'darwin' || (await firstOnPath('git', path)) !== SHIM) return 'git'
  const found = await runProcess('xcrun', ['--find', 'git'], {})
  const resolved = found.map(output => output.stdout.toString('utf8').trim()).unwrapOr('')
  return resolved === '' ? 'git' : resolved
}

/**
 * Returns the git command {@linkcode resolveGitCommand} picks for this process.
 *
 * It is looked up once, from the `PATH` at the first call, and reused.
 */
export function gitCommand(): Promise<string> {
  cached ??= resolveGitCommand(process.platform, process.env.PATH)
  return cached
}
