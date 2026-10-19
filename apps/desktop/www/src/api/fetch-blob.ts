/**
 * Reads a file through `GET /api/blob`.
 *
 * @module
 */

import type { BridgeResult } from './api.types'
import { request, thrownError } from './request'

/** The API path for a file at the repository's `HEAD`, with each segment encoded. */
export function blobPath(repo: string, path: string): string {
  const segments = [...repo.split('/'), 'HEAD', ...path.split('/')]
  return `/api/blob/${segments.map(encodeURIComponent).join('/')}`
}

/** Reads a file's bytes at the repository's `HEAD`. */
export async function fetchBlob(repo: string, path: string, signal: AbortSignal): Promise<BridgeResult<Uint8Array>> {
  const response = await request(blobPath(repo, path), signal)
  if (!response.ok) return response
  try {
    return { ok: true, value: new Uint8Array(await response.value.arrayBuffer()) }
  } catch (error) {
    return { ok: false, error: thrownError(error) }
  }
}
