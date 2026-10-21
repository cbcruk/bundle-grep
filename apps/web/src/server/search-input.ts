/**
 * Checks what the page asks a search, blob, or sync for.
 *
 * @module
 */

import type { BlobInput, SearchInput } from '../api/api.types'
import { MAX_LIMIT } from '../lib/search-limits'

/** The most context lines around a match. */
export const MAX_CONTEXT = 20

/** The longest query accepted. */
const MAX_QUERY = 4096

/** A commit id, the only refs a result links to. */
const COMMIT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

function record(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) throw new TypeError('Expected an object')
  return input as Record<string, unknown>
}

function whole(value: unknown, name: string, max: number): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new TypeError(`${name} must be a whole number up to ${max}`)
  }
  return value as number
}

/** Validates a search request: a query, a limit up to {@linkcode MAX_LIMIT}, and context up to {@linkcode MAX_CONTEXT}. */
export function parseSearchInput(input: unknown): SearchInput {
  const { q, limit, context } = record(input)
  if (typeof q !== 'string' || q.length > MAX_QUERY) throw new TypeError(`q must be a string of at most ${MAX_QUERY} characters`)
  return { q, limit: whole(limit, 'limit', MAX_LIMIT), context: whole(context, 'context', MAX_CONTEXT) }
}

/** Validates a file request: `owner/name`, a path, and an optional full commit id. */
export function parseBlobInput(input: unknown): BlobInput {
  const { repo, path, ref } = record(input)
  if (typeof repo !== 'string' || typeof path !== 'string') throw new TypeError('repo and path must be strings')
  if (ref !== undefined && (typeof ref !== 'string' || !COMMIT.test(ref))) throw new TypeError('ref must be a full commit id')
  return { repo, path, ...(ref === undefined ? {} : { ref }) }
}

/** Validates a sync request: a non-empty list of sources, as `bundle-grep sync` takes them. */
export function parseSyncInput(input: unknown): { sources: string[] } {
  const { sources } = record(input)
  if (!Array.isArray(sources) || sources.length === 0 || !sources.every(source => typeof source === 'string' && source.trim() !== '')) {
    throw new TypeError('sources must be a non-empty array of sources')
  }
  return { sources }
}
