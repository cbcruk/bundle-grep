/**
 * Runs git as a child process and collects its output.
 *
 * @module
 */

import type { Result } from 'better-result'

import { runProcess } from '../process/run-process'
import { GitError } from './git.errors'
import { gitCommand } from './git-command'
import type { GitOutput, RunGitOptions } from './git.types'

const REPOSITORY_ENV = {
  GIT_DIR: undefined,
  GIT_WORK_TREE: undefined,
  GIT_COMMON_DIR: undefined,
  GIT_INDEX_FILE: undefined,
  GIT_OBJECT_DIRECTORY: undefined,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
  GIT_NAMESPACE: undefined,
  GIT_PREFIX: undefined,
  GIT_LITERAL_PATHSPECS: undefined,
  GIT_GLOB_PATHSPECS: undefined,
  GIT_NOGLOB_PATHSPECS: undefined,
  GIT_ICASE_PATHSPECS: undefined,
}

/**
 * Runs git with the given arguments and waits for it to exit.
 *
 * `color.ui` is forced off, since a user's `color.ui=always` would otherwise
 * put escape codes into output that is parsed. A command-specific setting such
 * as `color.grep` still wins over it, so callers parsing output also pass
 * `--no-color`.
 *
 * On macOS the developer tools' git is run directly rather than through the
 * `/usr/bin/git` shim; see {@linkcode gitCommand}.
 *
 * Variables that point git at another repository, such as the `GIT_DIR` a
 * hook exports, are removed, so git always works on the repository at
 * {@linkcode RunGitOptions.cwd}; so are the ones that change how pathspecs
 * are read, such as `GIT_LITERAL_PATHSPECS`.
 *
 * @returns The output, or a {@linkcode GitError} when git cannot start or
 * exits with a status outside `0` and `allowExitCodes`.
 */
export async function runGit(args: readonly string[], options: RunGitOptions): Promise<Result<GitOutput, GitError>> {
  const result = await runProcess(await gitCommand(), ['-c', 'color.ui=never', ...args], {
    ...options,
    env: { ...REPOSITORY_ENV, ...options.env },
  })
  return result.mapError(
    failure =>
      new GitError({
        args,
        exitCode: failure.exitCode,
        stderr: failure.stderr,
        message: failure.started ? `git ${args[0] ?? ''} ${failure.reason}` : `Could not run git: ${failure.reason}`,
      }),
  )
}

/** Splits NUL-terminated output, as produced by git's `-z`, into its entries. */
export function splitNul(output: Buffer): string[] {
  const text = output.toString('utf8')
  return text === '' ? [] : text.replace(/\0$/, '').split('\0')
}
