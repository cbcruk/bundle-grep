/**
 * The ways syncing can fail beyond git and the file system.
 *
 * @module
 */

import { TaggedError } from 'better-result'

/** Another sync, in this process or another one, is already updating the repository. */
export class SyncLockedError extends TaggedError('SyncLockedError')<{
  /** The lock file the other sync holds. */
  readonly path: string
  /** The process holding the lock, when it could be read. */
  readonly pid: number | null
  /** Human-readable summary, suitable for showing the user. */
  readonly message: string
}> {}
