/**
 * This run's API token, as the page received it.
 *
 * @module
 */

const KEY = 'bundle-grep-token'

let token: string | undefined

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

/**
 * Reads the token from the URL `bundle-grep ui` opened, or from this tab's
 * session storage after a reload.
 *
 * The token arrives in the fragment, `#token=…`, which is never sent over
 * HTTP. The first call takes it out of the address bar, so call it before
 * anything else reads the location.
 *
 * @returns The token, or `undefined` when the page was opened without one.
 */
export function apiToken(): string | undefined {
  if (token !== undefined) return token
  const given = /^#token=([\w-]+)$/.exec(window.location.hash)?.[1]
  if (given) {
    store(given)
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
  }
  token = given ?? stored()
  return token
}
