/**
 * The ways reading a file from a repository can fail besides git failing.
 *
 * @module
 */

import { TaggedError } from 'better-result'

/** The tree has no file at that path: it is missing, a directory, or a submodule. */
export class BlobNotFoundError extends TaggedError('BlobNotFoundError')<{
  /** The path asked for. */
  readonly path: string
  /** Human-readable summary, suitable for showing the user. */
  readonly message: string
}> {}

/** The file is larger than the caller is willing to read. */
export class BlobTooLargeError extends TaggedError('BlobTooLargeError')<{
  /** The path asked for. */
  readonly path: string
  /** The file's size in bytes. */
  readonly size: number
  /** Human-readable summary, suitable for showing the user. */
  readonly message: string
}> {}
