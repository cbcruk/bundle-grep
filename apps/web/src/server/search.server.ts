/**
 * Runs a search as a stream of events.
 *
 * @module
 */

import {
  compileQuery,
  loadArchivedRepos,
  parseQuery,
  repoHolds,
  search,
  validateRegexes,
  type ArchiveLayout,
} from '@bundle-grep/core'

import type { SearchInput, SearchStreamEvent } from '../api/api.types'
import { iteratorStream } from './iterator-stream'
import { thrownError, toWireError } from '../lib/wire-error'

async function* events(input: SearchInput, layout: ArchiveLayout, signal: AbortSignal): AsyncGenerator<SearchStreamEvent, void> {
  const compiled = parseQuery(input.q).andThen(tree => compileQuery(tree).map(plan => ({ tree, plan })))
  if (compiled.isErr()) {
    yield { type: 'error', error: toWireError(compiled.error) }
    return
  }
  const { tree, plan } = compiled.value
  const checked = await validateRegexes(tree, { signal })
  if (checked.isErr()) {
    yield { type: 'error', error: toWireError(checked.error) }
    return
  }
  const loaded = await loadArchivedRepos(layout)
  if (loaded.isErr()) {
    yield { type: 'error', error: toWireError(loaded.error) }
    return
  }
  const { repos, unrestored, invalid } = loaded.value
  yield {
    type: 'archive',
    repos: repos.length,
    unrestored: unrestored.map(entry => `${entry.owner}/${entry.name}`),
    invalid: invalid.map(error => error.message),
  }
  const { limit, context } = input
  for await (const event of search({ plan, repos, holds: repoHolds, limit, context, signal })) {
    yield event.type === 'repo-error' ? { ...event, error: toWireError(event.error) } : event
  }
}

async function* guarded(input: SearchInput, layout: ArchiveLayout, signal: AbortSignal): AsyncGenerator<SearchStreamEvent, void> {
  try {
    yield* events(input, layout, signal)
  } catch (error) {
    if (!signal.aborted) yield { type: 'error', error: thrownError(error) }
  }
}

/**
 * Streams a search over the archive.
 *
 * The stream starts with an `archive` event — how many repositories are
 * being searched, which still need `restore`, and entries that could not be
 * read — then the core's `file`, `commit`, `repo-error`, and `done` events.
 * A query that does not parse or compile, or whose regexes git rejects, is a
 * lone `error` event carrying the error's span, so a bad query reaches the
 * page as data rather than as a failed request.
 *
 * Cancelling the stream, or `signal`, stops the search and kills its git
 * processes.
 */
export function searchStream(input: SearchInput, layout: ArchiveLayout, signal?: AbortSignal): ReadableStream<SearchStreamEvent> {
  const stop = new AbortController()
  const any = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal
  return iteratorStream(guarded(input, layout, any), { onCancel: () => stop.abort() })
}
