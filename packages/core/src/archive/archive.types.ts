/**
 * Types for the on-disk archive of bundles and their search caches.
 *
 * @module
 */

/** Where bundles and the bare repositories derived from them live. */
export interface ArchiveLayout {
  /** Holds `<owner>/<name>.bundle` and `<owner>/<name>.json`; the data worth backing up. */
  archiveDir: string
  /** Holds `<owner>/<name>.git` bare repositories, which can always be rebuilt. */
  cacheDir: string
}

/** The files belonging to one repository, from {@linkcode archivePaths}. */
export interface ArchivePaths {
  /** The bundle holding every branch and tag. */
  bundle: string
  /** The {@linkcode RepoMetadata} JSON written next to the bundle. */
  metadata: string
  /** The bare repository that is fetched into and searched. */
  gitDir: string
}

/** A repository found in the archive by {@linkcode listArchive}. */
export interface ArchiveEntry {
  /** The account the repository belongs to. */
  owner: string
  /** The repository's name, without its owner. */
  name: string
  /** Where the repository's files are; the bundle or the metadata may be missing. */
  paths: ArchivePaths
}

/**
 * What is recorded about a repository next to its bundle.
 *
 * Repository qualifiers such as `is:fork` are answered from it, so it is all
 * search needs to know about a repository besides its contents.
 */
export interface RepoMetadata {
  /** The format version of this file. */
  version: 1
  /** The account the repository belongs to. */
  owner: string
  /** The repository's name, without its owner. */
  name: string
  /** Where the repository is fetched from. */
  url: string
  /** Whether the repository is a fork. */
  isFork: boolean
  /** Whether the repository is archived. */
  isArchived: boolean
  /** Whether the repository is private, or `null` when the host was not asked. */
  isPrivate: boolean | null
  /** The language the host reports for the repository, or `null` when it reports none. */
  primaryLanguage: string | null
  /** The repository's description, or `null` when it has none. */
  description: string | null
  /** The branch `HEAD` points to, or `null` for an empty repository. */
  defaultBranch: string | null
  /** The commit at the tip of the default branch, or `null` for an empty repository. */
  head: string | null
  /** A digest of every ref and its object, which tells whether the bundle is out of date. */
  refsDigest: string
  /** The bundle's size in bytes, which tells a truncated bundle apart; `null` when none was written. */
  bundleSize: number | null
  /** When the host says the repository was last pushed to, as ISO 8601, or `null` when unknown. */
  pushedAt: string | null
  /** When the repository was last synced, as ISO 8601. */
  syncedAt: string
}
