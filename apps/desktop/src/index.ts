/**
 * The bundle-grep desktop app: a barlo window over a local-only search
 * server.
 *
 * @module
 */

export { createApi } from './api/create-api'
export { TOKEN_HEADER } from './api/guard'
export { createBridge } from './bridge/create-bridge'
export { UiNotBuiltError } from './desktop.errors'
export type {
  ApiOptions,
  ArchiveSummary,
  Bridge,
  BridgeOptions,
  BridgeResult,
  OpenAppError,
  OpenAppOptions,
  RepoList,
  RepoRow,
  RepoState,
  RestoreItem,
  SearchStreamEvent,
  Settings,
  SyncItem,
  WireError,
} from './desktop.types'
export { openApp } from './open-app'
