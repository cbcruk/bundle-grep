/**
 * Types shared by the desktop app's server and its page.
 *
 * @module
 */

import type { ArchiveLayout, RepoMetadata, RestoreStatus, SearchEvent, Span, SyncStatus } from '@bundle-grep/core'
import type { ServeError, UiNotBuiltError } from './desktop.errors'

/** Where the archive lives and how to reach it, for the routes that read or change it. */
export interface ArchiveRouteOptions {
  /** Where the archive and its search caches live. */
  layout: ArchiveLayout
  /** The root the layout came from, shown in settings. */
  root: string
}

/** Options for `jobRoutes`. */
export interface JobRouteOptions extends ArchiveRouteOptions {
  /** The GitHub CLI to run; `gh` on the `PATH` by default. */
  gh?: string
  /** Extra environment for the git that sync runs, such as `GIT_SSH_COMMAND`. */
  syncEnv?: Record<string, string | undefined>
  /** Stops a running sync or restore, such as when the server stops. */
  signal?: AbortSignal
  /** How long a stream may go quiet before a heartbeat line; 5000 by default. */
  heartbeatMs?: number
}

/** The sync and restore routes `jobRoutes` builds. */
export interface JobRoutes {
  /** `POST /api/sync`. */
  sync: (request: Request) => Promise<Response>
  /** `POST /api/restore`. */
  restore: (request: Request) => Promise<Response>
}

/** Options for {@linkcode createApi}. */
export interface ApiOptions extends JobRouteOptions {
  /** The only `Host` header accepted, such as `"127.0.0.1:53124"`. */
  host: string
  /** The per-run secret every `/api/` request must carry in {@linkcode TOKEN_HEADER}. */
  token: string
}

/** Answers a request, or declines it with `undefined` so that another handler can. */
export type ApiHandler = (request: Request) => Response | Promise<Response> | undefined

/** One `/api/` route: the method it answers, `HEAD` included for a `GET`, and how. */
export interface ApiRoute {
  /** The method it answers. */
  method: 'GET' | 'POST'
  /** Answers a request that passed the guard. */
  handle: (request: Request) => Response | Promise<Response>
}

/** Options for `sessionRoute`. */
export interface SessionRouteOptions {
  /** The only `Host` header accepted, such as `"127.0.0.1:53124"`. */
  host: string
  /** The one-time code the page's URL carries. */
  code: string
  /** The token to hand out for it. */
  token: string
}

/** Options for `searchRoute`. */
export type SearchRouteOptions = Pick<ApiOptions, 'layout' | 'heartbeatMs'>

/** Options for {@linkcode ndjsonResponse}. */
export interface NdjsonResponseOptions {
  /** How long the stream may go quiet before a heartbeat line; 5000 by default. */
  heartbeatMs?: number
  /** Runs when the client cancels the body, before the iterator is ended. */
  onCancel?: () => void
  /** Runs once when the stream is over, however it ended. */
  onClose?: () => void
}

/** The body of `POST /api/sync`. */
export interface SyncRequest {
  /** What to sync, as `bundle-grep sync` takes it: `owner`, `owner/name`, a git URL, or a local path. */
  sources: string[]
}

/** Why {@linkcode serveApp} could not start. */
export type ServeAppError = UiNotBuiltError | ServeError

/** Options for {@linkcode serveApp}. */
export interface ServeAppOptions extends Omit<JobRouteOptions, 'heartbeatMs'> {
  /** A dev server to proxy the UI from, such as `"http://localhost:5173"`; the embedded UI otherwise. */
  devServer?: string
  /** The port to listen on; any free one by default. */
  port?: number
}

/** A running {@linkcode serveApp}. */
export interface AppServer {
  /** The page's URL, with a one-time code for this run's token in its fragment. */
  url: string
  /** Stops a running sync or restore and closes every connection. */
  stop: () => Promise<void>
}

/** Where {@linkcode serveApp} gets the UI: a dev server to proxy, or the embedded page. */
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
 * What the page's API calls resolve to.
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

/** One archived repository, as `GET /api/repos` reports it. */
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

/** What `GET /api/repos` answers with. */
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

/** What `GET /api/settings` answers with. */
export interface Settings {
  /** The root everything lives under. */
  root: string
  /** Where bundles and metadata live. */
  archiveDir: string
  /** Where the search caches live. */
  cacheDir: string
}

/**
 * One line of a `POST /api/sync` or `POST /api/restore` stream.
 *
 * @template T The kind of item: {@linkcode SyncItem} or {@linkcode RestoreItem}.
 */
export type JobStreamEvent<T extends SyncItem | RestoreItem> =
  | T
  | {
      /** Nothing happened for a while. */
      type: 'heartbeat'
    }
