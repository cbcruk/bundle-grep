/**
 * Types for talking to the app's server.
 *
 * @module
 */

import type { ApiResult, ArchiveSummary, SearchStreamEvent, WireError } from '../../../src/desktop.types'

export type { ApiResult, ArchiveSummary, SearchStreamEvent, WireError }

/** What {@linkcode request} sends besides the token. */
export interface RequestOptions {
  /** Abandons the request. */
  signal?: AbortSignal
  /** `GET` by default. */
  method?: 'GET' | 'POST'
  /** Sent as JSON. */
  body?: unknown
}

/** What {@linkcode runJob} runs. */
export type Job =
  | {
      /** Sync sources into the archive. */
      kind: 'sync'
      /** `owner`, `owner/name`, a git URL, or a local path. */
      sources: string[]
    }
  | {
      /** Rebuild every search cache from its bundle. */
      kind: 'restore'
    }

/** What {@linkcode streamSearch} needs. */
export interface StreamSearchOptions {
  /** The query. */
  q: string
  /** Most files to receive. */
  limit: number
  /** Context lines around each match. */
  context: number
  /** Abandons the search, which stops it on the server too. */
  signal: AbortSignal
  /** Receives each line of the stream except heartbeats, as it arrives. */
  onEvent: (event: SearchStreamEvent) => void
}
