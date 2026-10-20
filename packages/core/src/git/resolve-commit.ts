/**
 * Resolves a revision to the commit it names.
 *
 * @module
 */

import type { Result } from 'better-result'

import type { GitError } from './git.errors'
import { runGit } from './run-git'

/**
 * Resolves a branch, tag, commit id, or other revision to a full commit id.
 *
 * @returns The commit id; `undefined` when the repository has no such commit;
 * or a {@linkcode GitError} when git cannot read the repository.
 */
export async function resolveCommit(gitDir: string, revision: string, signal?: AbortSignal): Promise<Result<string | undefined, GitError>> {
  const resolved = await runGit(['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`], {
    cwd: gitDir,
    allowExitCodes: [1],
    signal,
  })
  return resolved.map(({ stdout, exitCode }) => (exitCode === 0 ? stdout.toString('utf8').trim() : undefined))
}
