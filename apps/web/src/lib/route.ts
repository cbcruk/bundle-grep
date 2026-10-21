/**
 * Writes {@linkcode Route}s as addresses and reads their search parameters
 * back, so the back button and a reload both land on the same screen.
 *
 * @module
 */

import type { FileRoute, FileSearch, QuerySearch, Route } from './route.types'

/** A commit id, the only refs a result links to. */
const COMMIT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

/** Reads a query string into its parameters, every value a string. */
export function parseSearchString(search: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(search)) out[key] = value
  return out
}

/** Writes parameters as a query string with its leading `?`, leaving out empty ones, or `""` when none is left. */
export function stringifySearchObject(search: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** Reads the query and "Show more" from a search screen's parameters; anything else is the start page. */
export function validateQuerySearch(raw: Record<string, unknown>): QuerySearch {
  const q = typeof raw.q === 'string' ? raw.q : ''
  return raw.more === 'true' || raw.more === true ? { q, more: true } : { q }
}

/** Reads the file screen's commit and line, dropping a ref that is not a full commit id and a line that is not positive. */
export function validateFileSearch(raw: Record<string, unknown>): FileSearch {
  const line = Number(raw.line)
  return {
    ...(typeof raw.ref === 'string' && COMMIT.test(raw.ref) ? { ref: raw.ref } : {}),
    ...(Number.isInteger(line) && line > 0 ? { line } : {}),
  }
}

/** The file screen of `owner/repo` at a path, from its address's parts. */
export function fileRouteOf(params: { owner: string; repo: string; _splat?: string }, search: QuerySearch & FileSearch): FileRoute {
  return { view: 'file', ...search, repo: `${params.owner}/${params.repo}`, path: params._splat ?? '' }
}

/**
 * Writes a route as an address: `/` for searches, `/file/<owner>/<repo>/<path>`
 * for a file, and `/repos` for the repository list, with each path segment
 * encoded and the rest as query parameters.
 */
export function routeHref(route: Route): string {
  if (route.view === 'repos') return `/repos${stringifySearchObject({ q: route.q })}`
  if (route.view === 'search') return `/${stringifySearchObject({ q: route.q, more: route.more })}`
  const segments = [...route.repo.split('/'), ...route.path.split('/')].map(encodeURIComponent)
  return `/file/${segments.join('/')}${stringifySearchObject({ q: route.q, more: route.more, ref: route.ref, line: route.line })}`
}
