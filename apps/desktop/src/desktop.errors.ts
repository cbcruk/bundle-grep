/**
 * The ways the desktop app can fail before its window shows anything.
 *
 * @module
 */

import { TaggedError } from 'better-result'

/** The embedded UI is missing because `pnpm build:ui` has not been run. */
export class UiNotBuiltError extends TaggedError('UiNotBuiltError')<{
  /** Human-readable summary, naming the command that builds the UI. */
  readonly message: string
}> {}
