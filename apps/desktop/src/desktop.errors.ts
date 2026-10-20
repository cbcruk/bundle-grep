/**
 * The ways the desktop app can fail before it serves anything.
 *
 * @module
 */

import { TaggedError } from 'better-result'

/** The embedded UI is missing because `pnpm build:ui` has not been run. */
export class UiNotBuiltError extends TaggedError('UiNotBuiltError')<{
  /** Human-readable summary, naming the command that builds the UI. */
  readonly message: string
}> {}

/** The server could not listen, such as on a port already in use. */
export class ServeError extends TaggedError('ServeError')<{
  /** Human-readable summary. */
  readonly message: string
  /** What `Bun.serve` threw. */
  readonly cause: unknown
}> {}
