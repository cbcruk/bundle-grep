/**
 * This run's API token, as the page received it.
 *
 * @module
 */

import type { ApiResult, WireError } from './api.types'

const KEY = 'bundle-grep-token'

let token: Promise<ApiResult<string>> | undefined

function stored(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined
  } catch {
    return undefined
  }
}

function store(value: string): void {
  try {
    sessionStorage.setItem(KEY, value)
  } catch {
    return
  }
}

async function redeem(code: string): Promise<ApiResult<string>> {
  try {
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const body = (await response.json()) as { token?: string; error?: WireError }
    if (response.ok && typeof body.token === 'string') {
      store(body.token)
      return { ok: true, value: body.token }
    }
    return { ok: false, error: { _tag: 'ForbiddenError', message: body.error?.message ?? `The server answered ${response.status}` } }
  } catch (error) {
    return { ok: false, error: { _tag: 'NetworkError', message: error instanceof Error ? error.message : String(error) } }
  }
}

/**
 * Gets this run's token: by trading the one-time code in the URL
 * `bundle-grep ui` opened, or from this tab's session storage after a reload.
 *
 * The code arrives in the fragment, `#code=…`, which is never sent over HTTP.
 * The first call takes it out of the address bar, so call it before anything
 * else reads the location.
 *
 * @returns The token, or why the page has none.
 */
export function apiToken(): Promise<ApiResult<string>> {
  if (token) return token
  const code = /^#code=([\w-]+)$/.exec(window.location.hash)?.[1]
  if (code) {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
    token = redeem(code)
  } else {
    const kept = stored()
    token = Promise.resolve(
      kept
        ? { ok: true, value: kept }
        : { ok: false, error: { _tag: 'ForbiddenError', message: 'This page has no API token; open the URL `bundle-grep ui` printed' } },
    )
  }
  return token
}
