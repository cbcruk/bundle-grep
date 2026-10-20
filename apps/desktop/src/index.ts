/**
 * The bundle-grep search page: a local-only server for the API and the UI,
 * opened in the user's browser.
 *
 * @module
 */

export { createApi } from './api/create-api'
export { TOKEN_HEADER } from './api/guard'
export { DEFAULT_HEARTBEAT_MS, ndjsonResponse } from './api/ndjson-response'
export { ServeError, UiNotBuiltError } from './desktop.errors'
export type {
  ApiHandler,
  ApiOptions,
  ApiResult,
  AppServer,
  ArchiveRouteOptions,
  ArchiveSummary,
  JobRouteOptions,
  JobStreamEvent,
  NdjsonResponseOptions,
  RepoList,
  RepoRow,
  RepoState,
  RestoreItem,
  SearchStreamEvent,
  ServeAppError,
  ServeAppOptions,
  Settings,
  SyncItem,
  SyncRequest,
  WireError,
} from './desktop.types'
export { openBrowser } from './open-browser'
export { serveApp } from './serve-app'
