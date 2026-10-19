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
  /** Repositories with a bundle but no usable search cache; restore them to search them. */
  unrestored: ArchiveEntry[]
  /** Repositories left out: unreadable metadata, or neither a bundle nor a cache. */
  invalid: FileSystemError[]
}

/** Which list of {@linkcode LoadedRepos} one archive entry belongs in. */
export type Classified =
  | { /** Ready to search. */ type: 'repos'; /** The repository. */ value: ArchivedRepo }
  | { /** Empty or unrestored. */ type: 'empty' | 'unrestored'; /** The entry. */ value: ArchiveEntry }
  | { /** Left out. */ type: 'invalid'; /** Why. */ value: FileSystemError }
