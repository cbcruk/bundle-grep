/**
 * The ways searching a repository can fail besides git itself failing.
 *
 * @module
 */

import { TaggedError } from 'better-result'

/** The query has a regex, and this git was built without PCRE, which `-P` needs. */
export class PcreUnavailableError extends TaggedError('PcreUnavailableError')<{
  /** Human-readable summary, suitable for showing the user. */
  readonly message: string
}> {}
