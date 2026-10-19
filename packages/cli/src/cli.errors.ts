/**
 * Errors raised by the `bundle-grep` command line itself.
 *
 * @module
 */

import { TaggedError } from 'better-result'

/** Arguments a command cannot make sense of. */
export class UsageError extends TaggedError('UsageError')<{
  /** What is wrong with the arguments. */
  readonly message: string
}> {}
