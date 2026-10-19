/**
 * Tells whether a repository's `HEAD` resolves to a commit.
 *
 * @module
 */

import type { Result } from 'better-result'

import type { GitError } from './git.errors'
import { runGit } from './run-git'

/**
 * Tells whether a repository's `HEAD` resolves to a commit.
 *
 * @returns `true` when it does, `false` for a repository with no commits yet,
 * or a {@linkcode GitError} when `gitDir` is not a repository git can read.
 */
export async function hasCommit(gitDir: string, signal?: AbortSignal): Promise<Result<boolean, GitError>> {
  const resolved = await runGit([`--git-dir=${gitDir}`, 'rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], {
    cwd: gitDir,
    allowExitCodes: [1],
    signal,
  })
  return resolved.map(({ exitCode }) => exitCode === 0)
}
