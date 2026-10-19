/**
 * Types shared by the desktop app's server, bridge, and entry point.
 *
 * @module
 */

import type { ArchiveLayout, RepoMetadata, RestoreStatus, SearchEvent, Span, SyncStatus } from '@bundle-grep/core'
import type { EvaluateError, LaunchError, LaunchOptions, LoadError, WindowError } from 'barlo'

import type { UiNotBuiltError } from './desktop.errors'

/** Options for {@linkcode createApi}. */
export interface ApiOptions {
  /** Where the archive and its search caches live. */
  layout: ArchiveLayout
  /** The only `Host` header accepted, such as `"127.0.0.1:53124"`. */
  host: string
  /** The per-run secret every `/api/` request must carry in {@linkcode TOKEN_HEADER}. */
  token: string
  /** How long a search stream may go quiet before a heartbeat line; 5000 by default. */
  heartbeatMs?: number
}

/** Options for {@linkcode searchRoute}. */
export type SearchRouteOptions = Pick<ApiOptions, 'layout' | 'heartbeatMs'>

/** Options for {@linkcode createBridge}. */
export interface BridgeOptions {
  /** Where the archive and its search caches live. */
  layout: ArchiveLayout
  /** The root the layout came from, shown in settings. */
  root: string
  /** The GitHub CLI to run; `gh` on the `PATH` by default. */
  gh?: string
  /** Extra environment for the git that sync runs, such as `GIT_SSH_COMMAND`. */
  syncEnv?: Record<string, string | undefined>
  /** Stops a running sync or restore when the app closes. */
  signal?: AbortSignal
}

/** Why the window could not be opened. */
export type OpenAppError = LaunchError | EvaluateError | WindowError | LoadError | UiNotBuiltError

/** Options for {@linkcode openApp}. */
export interface OpenAppOptions extends BridgeOptions {
  /** A dev server to proxy the UI from, such as `"http://localhost:5173"`; the embedded UI otherwise. */
  devServer?: string
  /** Passed to barlo's `launch`. */
  launch?: LaunchOptions
}

/** Where {@linkcode openApp} gets the UI: a dev server to proxy, or the embedded page. */
export type UiSource =
  | {
      /** The dev server's origin. */
      origin: string
    }
  | {
      /** The built UI, as one self-contained HTML file. */
      page: string
    }

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
 * What a bridge function resolves to.
 *
 * The bridge turns a thrown error into a bare string on the page, so failures
 * come back as values instead.
 *
 * @template T What a success carries.
 */
export type BridgeResult<T> =
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

/** One archived repository, as `listRepos` reports it. */
export interface RepoRow {
  /** `owner/name`. */
  name: string
  /** Whether it can be searched. */
  state: RepoState
  /** What was recorded when it was synced, or `null` for a bundle without metadata. */
  metadata: RepoMetadata | null
}

/** The first line of a search stream: what is being searched. */
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

/**
 * One line of the `GET /api/search` stream.
 *
 * The core's search events, with a `repo-error`'s error reduced to a
 * {@linkcode WireError}, between an {@linkcode ArchiveSummary} and `done`.
 * A `heartbeat` carries nothing; it only keeps the connection open.
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
      /** Nothing happened for a while. */
      type: 'heartbeat'
    }

/** What `listRepos` resolves to. */
export interface RepoList {
  /** The repositories, sorted by name. */
  repos: RepoRow[]
  /** Messages for archive entries that could not be read. */
  invalid: string[]
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

/** What `getSettings` resolves to. */
export interface Settings {
  /** The root everything lives under. */
  root: string
  /** Where bundles and metadata live. */
  archiveDir: string
  /** Where the search caches live. */
  cacheDir: string
}

/** The functions the page can call, keyed by the name they are exposed under. */
export interface Bridge {
  /** Lists archived repositories. */
  bundleGrepListRepos: () => Promise<BridgeResult<RepoList>>
  /** Syncs sources as `bundle-grep sync` would; one sync or restore runs at a time. */
  bundleGrepSync: (sources: unknown) => Promise<BridgeResult<SyncItem[]>>
  /** Rebuilds every search cache from its bundle; one sync or restore runs at a time. */
  bundleGrepRestore: () => Promise<BridgeResult<RestoreItem[]>>
  /** Reports where the archive lives. */
  bundleGrepSettings: () => Promise<BridgeResult<Settings>>
  /** Lists the names `language:` accepts, popular ones first. */
  bundleGrepLanguages: () => Promise<BridgeResult<string[]>>
}
