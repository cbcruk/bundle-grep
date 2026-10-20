/**
 * Reads what the archive holds through the API.
 *
 * @module
 */

import type { RepoList, Settings } from '../../../src/desktop.types'
import type { ApiResult } from './api.types'
import { requestJson } from './request'

/** Lists the archived repositories, through `GET /api/repos`. */
export function listRepos(): Promise<ApiResult<RepoList>> {
  return requestJson('/api/repos')
}

/** Reports where the archive lives, through `GET /api/settings`. */
export function getSettings(): Promise<ApiResult<Settings>> {
  return requestJson('/api/settings')
}

/** Lists the names `language:` accepts, popular ones first. */
export function listLanguages(): Promise<ApiResult<string[]>> {
  return requestJson('/api/languages')
}

/** Lists the languages `symbol:` finds definitions in. */
export function listSymbolLanguages(): Promise<ApiResult<string[]>> {
  return requestJson('/api/symbol-languages')
}
