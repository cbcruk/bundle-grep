/**
 * Reads a file through `GET /api/blob`.
 *
 * @module
 */

import type { BridgeResult } from './api.types'
import { request, thrownError } from './request'

/** The API path for a file at a commit, the repository's `HEAD` by default, with each segment encoded. */
export function blobPath(repo: string, path: string, ref = 'HEAD'): string {
  const segments = [...repo.split('/'), ref, ...path.split('/')]
  return `/api/blob/${segments.map(encodeURIComponent).join('/')}`
}

/** Reads a file's bytes at a commit, or at the repository's `HEAD` when `ref` is absent. */
export async function fetchBlob(
  repo: string,
  path: string,
  ref: string | undefined,
  signal: AbortSignal,
): Promise<BridgeResult<Uint8Array>> {
  const response = await request(blobPath(repo, path, ref), signal)
  if (!response.ok) return response
  try {
    return { ok: true, value: new Uint8Array(await response.value.arrayBuffer()) }
  } catch (error) {
    return { ok: false, error: thrownError(error) }
  }
}
