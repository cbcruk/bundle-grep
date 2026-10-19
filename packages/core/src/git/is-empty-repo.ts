/**
 * Tells a repository with nothing in it from one that is broken.
 *
 * @module
 */

import type { Result } from 'better-result'

import type { GitError } from './git.errors'
import { runGit } from './run-git'

/**
 * Tells whether a repository has no refs at all, as a fresh `git init` does.
 *
 * A ref pointing at a missing object still counts, so a corrupt repository
 * is not mistaken for an empty one.
 *
 * @returns `true` when it has no refs, or a {@linkcode GitError} when `gitDir`
 * is not a repository git can read.
 */
export async function isEmptyRepo(gitDir: string, signal?: AbortSignal): Promise<Result<boolean, GitError>> {
  const refs = await runGit([`--git-dir=${gitDir}`, 'for-each-ref', '--count=1', '--format=%(refname)'], {
    cwd: gitDir,
    signal,
  })
  return refs.map(({ stdout }) => stdout.length === 0)
}
