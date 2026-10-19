/**
 * Types for choosing archived repositories to search.
 *
 * @module
 */

import type { FileSystemError } from '../archive/archive.errors'
import type { ArchiveEntry, RepoMetadata } from '../archive/archive.types'
import type { SearchRepo } from '../search/search.types'

/** An archived repository whose cache can be searched. */
export interface ArchivedRepo extends SearchRepo {
  /** Where the repository sits in the archive. */
  entry: ArchiveEntry
  /** The metadata synced with the bundle, or `undefined` for a bundle archived without it. */
  metadata: RepoMetadata | undefined
}

/** What {@linkcode loadArchivedRepos} found in an archive. */
export interface LoadedRepos {
  /** The repositories ready to search, in archive order. */
  repos: ArchivedRepo[]
  /** Repositories that were empty when synced, so hold nothing to search. */
  empty: ArchiveEntry[]
  /** Repositories with no search cache yet; restore them to search them. */
  unrestored: ArchiveEntry[]
  /** Metadata files that could not be read; their repositories are left out. */
  invalid: FileSystemError[]
}
