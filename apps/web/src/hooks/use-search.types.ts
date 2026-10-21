/**
 * Types for the search the results screen shows.
 *
 * @module
 */

import type { ArchiveSummary, SearchStreamEvent, WireError } from '../api/api.types'

/** One matching file, as the stream sends it. */
export type FileResult = Extract<SearchStreamEvent, { type: 'file' }>

/** One commit a `history:` search found, as the stream sends it. */
export type CommitResult = Extract<SearchStreamEvent, { type: 'commit' }>

/** The last line of the stream: totals and facets. */
export type SearchDone = Extract<SearchStreamEvent, { type: 'done' }>

/** A repository that could not be searched. */
export type RepoFailure = Extract<SearchStreamEvent, { type: 'repo-error' }>

/** A search as far as it has got. */
export interface SearchState {
  /** `idle` with no query, `running` while the stream is open, then `done` or `error`. */
  status: 'idle' | 'running' | 'done' | 'error'
  /** What is being searched, once the stream has said. */
  archive?: ArchiveSummary
  /** Matching files, in the order they arrived. */
  files: FileResult[]
  /** Matching commits of a `history:` search, in the order they arrived. */
  commits: CommitResult[]
  /** Repositories that failed; the rest of the search carried on. */
  failures: RepoFailure[]
  /** Totals and facets, once the search is over. */
  done?: SearchDone
  /** Why the search failed: a query the server rejected, a dropped connection, or a cancel. */
  error?: WireError
}
