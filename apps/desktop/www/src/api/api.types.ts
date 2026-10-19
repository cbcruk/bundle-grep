/**
 * Types for talking to the app's server and bridge.
 *
 * @module
 */

import type { ArchiveSummary, Bridge, BridgeResult, SearchStreamEvent, WireError } from '../../../src/desktop.types'

export type { ArchiveSummary, Bridge, BridgeResult, SearchStreamEvent, WireError }

/** The bridge functions, plus the one that hands out the API token. */
export type PageBridge = Bridge & {
  /** Resolves to this run's API token. */
  bundleGrepToken: () => Promise<string>
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
