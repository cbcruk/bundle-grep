/**
 * `GET /api/search`: streams a search as newline-delimited JSON.
 *
 * @module
 */

import {
  compileQuery,
  loadArchivedRepos,
  parseQuery,
  QueryCompileError,
  QueryParseError,
  repoHolds,
  search,
  validateRegexes,
  type ArchiveLayout,
  type SearchEvent,
} from '@bundle-grep/core'
import { Result } from 'better-result'

import { toWireError } from '../wire-error'
import { errorResponse } from './respond'

function wholeNumber(params: URLSearchParams, name: string, fallback: number): Result<number, Response> {
  const raw = params.get(name)
  if (raw === null) return Result.ok(fallback)
  if (!/^\d+$/.test(raw)) {
    return Result.err(errorResponse(400, { _tag: 'UsageError', message: `${name} must be a whole number, not "${raw}"` }))
  }
  return Result.ok(Number(raw))
}

function lineOf(event: SearchEvent): string {
  const shown = event.type === 'repo-error' ? { ...event, error: toWireError(event.error) } : event
  return `${JSON.stringify(shown)}\n`
}

/**
 * Answers a search request.
 *
 * Query parameters: `q`, the GitHub code search query; `limit`, the most files
 * to send (default 100); and `context`, lines around each match (default 0).
 * A query that does not parse or compile, or whose regexes git rejects, is a
 * `400` carrying the error's span.
 *
 * The stream starts with an `archive` line — how many repositories are being
 * searched, which still need `restore`, and entries that could not be read —
 * then the core's `file` and `repo-error` events, and ends with `done`.
 * Closing the connection stops the search and kills its git processes.
 */
export async function searchRoute(request: Request, layout: ArchiveLayout): Promise<Response> {
  const params = new URL(request.url).searchParams
  const query = params.get('q') ?? ''
  if (query.trim() === '') return errorResponse(400, { _tag: 'UsageError', message: 'q is required' })
  const numbers = wholeNumber(params, 'limit', 100).andThen(limit =>
    wholeNumber(params, 'context', 0).map(context => ({ limit, context })),
  )
  if (numbers.isErr()) return numbers.error

  const compiled = parseQuery(query).andThen(tree => compileQuery(tree).map(plan => ({ tree, plan })))
  if (compiled.isErr()) return errorResponse(400, toWireError(compiled.error))
  const { tree, plan } = compiled.value

  const checked = await validateRegexes(tree, { signal: request.signal })
  if (checked.isErr()) {
    const { error } = checked
    const bad = error instanceof QueryCompileError || error instanceof QueryParseError
    return errorResponse(bad ? 400 : 500, toWireError(error))
  }

  const loaded = await loadArchivedRepos(layout)
  if (loaded.isErr()) return errorResponse(500, toWireError(loaded.error))
  const { repos, unrestored, invalid } = loaded.value

  const stop = new AbortController()
  const signal = AbortSignal.any([request.signal, stop.signal])
  const events = search({ plan, repos, holds: repoHolds, ...numbers.value, signal })
  const encoder = new TextEncoder()
  const archive = {
    type: 'archive',
    repos: repos.length,
    unrestored: unrestored.map(entry => `${entry.owner}/${entry.name}`),
    invalid: invalid.map(error => error.message),
  }
  let started = false

  const body = new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      if (!started) {
        started = true
        controller.enqueue(encoder.encode(`${JSON.stringify(archive)}\n`))
        return
      }
      const next = await events.next()
      if (next.done) controller.close()
      else controller.enqueue(encoder.encode(lineOf(next.value)))
    },
    async cancel(): Promise<void> {
      stop.abort()
      await events.return(undefined)
    },
  })
  return new Response(body, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  })
}
