/**
 * The ways reading or writing the archive can fail.
 *
 * @module
 */

import { TaggedError } from 'better-result'

/** An owner or repository name that cannot be used as a path segment. */
export class InvalidRepoNameError extends TaggedError('InvalidRepoNameError')<{
  /** The rejected name. */
  readonly value: string
  /** Human-readable summary, suitable for showing the user. */
  readonly message: string
}> {}

/** A bundle disagrees with its metadata, or is missing although the metadata says there should be one. */
export class ArchiveMismatchError extends TaggedError('ArchiveMismatchError')<{
  /** The bundle or metadata file in question. */
  readonly path: string
  /** Human-readable summary, suitable for showing the user. */
  readonly message: string
}> {}

/** A file or directory in the archive could not be read or written. */
export class FileSystemError extends TaggedError('FileSystemError')<{
  /** The path the operation was on. */
  readonly path: string
  /** Human-readable summary, suitable for showing the user. */
  readonly message: string
}> {}

/** Another sync or restore, in this process or another one, is already updating the repository. */
export class RepoLockedError extends TaggedError('RepoLockedError')<{
  /** The lock file the other run holds. */
  readonly path: string
  /** The process holding the lock, when it could be read. */
  readonly pid: number | null
  /** Human-readable summary, suitable for showing the user. */
  readonly message: string
}> {}
