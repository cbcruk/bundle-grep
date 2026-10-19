/**
 * The ways running git can fail.
 *
 * @module
 */

import { TaggedError } from 'better-result'

/** git could not be started, or exited with a status the caller did not expect. */
export class GitError extends TaggedError('GitError')<{
  /** The arguments git was run with. */
  readonly args: readonly string[]
  /** The exit status, or `null` when git never started or was killed by a signal. */
  readonly exitCode: number | null
  /** What git wrote to stderr, trimmed. */
  readonly stderr: string
  /** Human-readable summary, suitable for logging or showing the user. */
  readonly message: string
}> {}
