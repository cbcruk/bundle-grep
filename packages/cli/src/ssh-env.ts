/**
 * Keeps ssh from prompting when nobody is there to answer.
 *
 * @module
 */

import { Result } from 'better-result'
import { tmpdir } from 'node:os'

/**
 * Decides the extra git environment that makes ssh fail instead of prompting
 * for a passphrase or an unknown host key.
 *
 * Only applies when nobody is at the terminal and the user has not chosen an
 * ssh command themselves through `GIT_SSH_COMMAND`, `GIT_SSH`, or
 * `core.sshCommand`, all of which `GIT_SSH_COMMAND` would override.
 *
 * @param configured Whether git config sets `core.sshCommand`.
 * @returns The variables to add, empty when none are needed.
 */
export function batchSshEnv(
  env: Record<string, string | undefined>,
  interactive: boolean,
  configured: boolean,
): Record<string, string> {
  if (interactive || configured || env.GIT_SSH_COMMAND !== undefined || env.GIT_SSH !== undefined) return {}
  return { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' }
}

/**
 * Says whether the user's global or system git config sets `core.sshCommand`.
 *
 * Runs outside any repository, as the fetch's own bare cache has no such
 * setting of its own; a git that cannot run counts as not set.
 */
export function hasSshCommandConfig(): boolean {
  const config = Result.try(() =>
    Bun.spawnSync(['git', 'config', '--get', 'core.sshCommand'], { cwd: tmpdir(), env: process.env, stdout: 'pipe', stderr: 'ignore' }),
  )
  return config.isOk() && config.value.exitCode === 0 && config.value.stdout.toString().trim() !== ''
}
