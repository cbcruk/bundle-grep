/**
 * Keeps ssh from prompting when nobody is there to answer.
 *
 * @module
 */

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

/** Says whether the user's git config sets `core.sshCommand`. */
export function hasSshCommandConfig(): boolean {
  const config = Bun.spawnSync(['git', 'config', '--get', 'core.sshCommand'], { stdout: 'pipe', stderr: 'ignore' })
  return config.exitCode === 0 && config.stdout.toString().trim() !== ''
}
