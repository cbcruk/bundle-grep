/**
 * Types for running git.
 *
 * @module
 */

/** Options for {@linkcode runGit}. */
export interface RunGitOptions {
  /** The repository to run in: a work tree or a bare repository. */
  cwd: string
  /**
   * Exit statuses that count as success, besides `0`.
   *
   * `git grep` exits with `1` when nothing matches, which is an answer rather
   * than a failure.
   */
  allowExitCodes?: readonly number[]
  /** Kills git when aborted; the run then fails with a {@linkcode GitError}. */
  signal?: AbortSignal
}

/** What a successful git run produced. */
export interface GitOutput {
  /** Everything git wrote to stdout. */
  stdout: Buffer
  /** The exit status, `0` or one of {@linkcode RunGitOptions.allowExitCodes}. */
  exitCode: number
}
