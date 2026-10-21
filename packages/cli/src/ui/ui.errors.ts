/**
 * The ways `bundle-grep ui` can fail before it serves anything.
 *
 * @module
 */

import { TaggedError } from 'better-result'

/** The web app has not been built, as in a checkout before `pnpm build:web`. */
export class UiNotBuiltError extends TaggedError('UiNotBuiltError')<{
  /** Human-readable summary, naming the command that builds the app. */
  readonly message: string
}> {}

/** The server could not listen, such as on a port already in use. */
export class ServeError extends TaggedError('ServeError')<{
  /** Human-readable summary. */
  readonly message: string
  /** Why listening failed. */
  readonly cause: unknown
}> {}
