/**
 * Types for reading one file from a repository.
 *
 * @module
 */

import type { GitError } from '../git/git.errors'
import type { BlobNotFoundError, BlobTooLargeError } from './blob.errors'

/** Options for {@linkcode readBlob}. */
export interface ReadBlobOptions {
  /** The repository, usually a search cache. */
  gitDir: string
  /** The tree to read from, such as `HEAD` or a commit id. */
  ref: string
  /** The file's path relative to the repository root, with `/` separators. */
  path: string
  /** Largest file to read, in bytes; 10 MiB by default. */
  maxBytes?: number
  /** Kills git when aborted. */
  signal?: AbortSignal
}

/** Why a file could not be read. */
export type ReadBlobError = BlobNotFoundError | BlobTooLargeError | GitError
