/**
 * Types the page and its server functions exchange.
 *
 * @module
 */

import type { RepoMetadata, RestoreStatus, SearchEvent, Span, SyncStatus } from '@bundle-grep/core'

/** A failure as the page sees it: the error's tag and message, plus a span for query errors. */
export interface WireError {
  /** The error class's tag, such as `"QueryParseError"`. */
  _tag: string
  /** Human-readable summary. */
  message: string
  /** The offending part of the query, for query errors. */
  span?: Span
}

/**
 * What a server function that can fail answers with.
 *
 * @template T What a success carries.
 */
export type ApiResult<T> =
  | {
      /** Discriminant. */
      ok: true
      /** The result. */
      value: T
    }
  | {
      /** Discriminant. */
      ok: false
      /** Why it failed. */
      error: WireError
    }

/** Whether an archived repository can be searched. */
export type RepoState = 'ready' | 'unrestored' | 'empty'

/** One archived repository, as the repository list shows it. */
export interface RepoRow {
  /** `owner/name`. */
  name: string
  /** Whether it can be searched. */
  state: RepoState
  /** What was recorded when it was synced, or `null` for a bundle without metadata. */
  metadata: RepoMetadata | null
}

/** Every archived repository. */
export interface RepoList {
  /** The repositories, sorted by name. */
  repos: RepoRow[]
  /** Messages for archive entries that could not be read. */
  invalid: string[]
}

/** Where the archive lives. */
export interface Settings {
  /** The root everything lives under. */
  root: string
  /** Where bundles and metadata live. */
  archiveDir: string
  /** Where the search caches live. */
  cacheDir: string
}

/** What every screen needs: the repositories, and the names completion offers. */
export interface ArchiveIndex {
  /** The archived repositories, or why they could not be listed. */
  repos: ApiResult<RepoList>
  /** The names `language:` accepts, popular ones first. */
  languages: string[]
  /** The languages `symbol:` finds definitions in. */
  symbolLanguages: string[]
}

/** The first event of a search: what is being searched. */
export interface ArchiveSummary {
  /** Discriminant. */
  type: 'archive'
  /** How many repositories are being searched. */
  repos: number
  /** `owner/name` of repositories that need `restore` before they can be searched. */
  unrestored: string[]
  /** Messages for archive entries that could not be read. */
  invalid: string[]
}

/** What a search is asked for. */
export interface SearchInput {
  /** The GitHub code search query. */
  q: string
  /** The most files to send. */
  limit: number
  /** Lines of context around each match. */
  context: number
}

/**
 * One event of a search stream.
 *
 * The core's search events, with a `repo-error`'s error reduced to a
 * {@linkcode WireError}, after an {@linkcode ArchiveSummary}. A query that is
 * rejected, or a search that fails as a whole, is a lone `error` instead.
 */
export type SearchStreamEvent =
  | ArchiveSummary
  | Exclude<SearchEvent, { type: 'repo-error' }>
  | {
      /** A repository that failed; the others carry on. */
      type: 'repo-error'
      /** `owner/name`. */
      repo: string
      /** What went wrong. */
      error: WireError
    }
  | {
      /** The search could not run. */
      type: 'error'
      /** Why, with the span of the query for a query error. */
      error: WireError
    }

/** What happened to one source or repository during `sync`. */
export type SyncItem =
  | {
      /** A repository was synced. */
      type: 'synced'
      /** `owner/name`. */
      repo: string
      /** What changed. */
      status: SyncStatus
    }
  | {
      /** A source resolved, with something worth telling the user. */
      type: 'warning'
      /** The source as given. */
      source: string
      /** What to tell the user. */
      message: string
    }
  | {
      /** A source could not be resolved, or a repository failed to sync. */
      type: 'failed'
      /** The source as given, or `owner/name` once resolved. */
      subject: string
      /** Why. */
      error: WireError
    }

/** What happened to one repository during `restore`. */
export type RestoreItem =
  | {
      /** The search cache was rebuilt or found current. */
      type: 'restored'
      /** `owner/name`. */
      repo: string
      /** What changed. */
      status: RestoreStatus
    }
  | {
      /** The search cache could not be rebuilt. */
      type: 'failed'
      /** `owner/name`. */
      subject: string
      /** Why. */
      error: WireError
    }

/** Which file to read, and at which commit. */
export interface BlobInput {
  /** `owner/name`. */
  repo: string
  /** The path in the repository. */
  path: string
  /** A commit id, or `undefined` for `HEAD`. */
  ref?: string
}

/** A file's contents, ready to show. */
export type BlobContent =
  | {
      /** The file is text. */
      kind: 'text'
      /** Its lines, without line terminators. */
      lines: string[]
    }
  | {
      /** The file is binary, so it is not shown. */
      kind: 'binary'
      /** Its size in bytes. */
      size: number
    }
