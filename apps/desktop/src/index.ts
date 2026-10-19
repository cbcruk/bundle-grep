/**
 * The bundle-grep desktop app: a barlo window over a local-only search
 * server.
 *
 * @module
 */

export { createApi } from './api/create-api'
export { TOKEN_HEADER } from './api/guard'
export { createBridge } from './bridge/create-bridge'
export type {
  ApiOptions,
  Bridge,
  BridgeOptions,
  BridgeResult,
  OpenAppOptions,
  RepoList,
  RepoRow,
  RepoState,
  RestoreItem,
  Settings,
  SyncItem,
  WireError,
} from './desktop.types'
export { openApp, type OpenAppError } from './open-app'
