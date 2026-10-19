/**
 * The ways asking GitHub about repositories can fail.
 *
 * @module
 */

import { TaggedError } from 'better-result'

/** The GitHub CLI could not be run, failed, or printed something unexpected. */
export class GhError extends TaggedError('GhError')<{
  /** The arguments `gh` was run with. */
  readonly args: readonly string[]
  /** What `gh` wrote to stderr, trimmed; empty when it did not run or succeeded with bad output. */
  readonly stderr: string
  /** Human-readable summary, suitable for showing the user. */
  readonly message: string
}> {}
