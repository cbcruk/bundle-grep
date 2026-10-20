/**
 * Reads and writes {@linkcode Route}s as query strings, so the back button
 * and a reload both land on the same screen.
 *
 * @module
 */

import type { Route } from './route.types'

/** A commit id, the only refs a result links to. */
const COMMIT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

/** Reads a route from a query string such as `location.search`; anything unknown is the search screen. */
export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search)
  const q = params.get('q') ?? ''
  const view = params.get('view')
  if (view === 'repos') return { view, q }
  const repo = params.get('repo')
  const path = params.get('path')
  if (view === 'file' && repo && path) {
    const line = Number(params.get('line'))
    const ref = params.get('ref')
    return {
      view,
      q,
      repo,
      path,
      ...(ref && COMMIT.test(ref) ? { ref } : {}),
      ...(Number.isInteger(line) && line > 0 ? { line } : {}),
    }
  }
  return { view: 'search', q }
}

/** Writes a route as a query string, with its leading `?`, or `""` for the empty search screen. */
export function routeSearch(route: Route): string {
  const params = new URLSearchParams()
  if (route.view !== 'search') params.set('view', route.view)
  if (route.view === 'file') {
    params.set('repo', route.repo)
    params.set('path', route.path)
    if (route.ref !== undefined) params.set('ref', route.ref)
    if (route.line !== undefined) params.set('line', String(route.line))
  }
  if (route.q) params.set('q', route.q)
  const text = params.toString()
  return text ? `?${text}` : ''
}
