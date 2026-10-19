/**
 * `GET /api/blob/:owner/:repo/:ref/*path`: one file from a search cache.
 *
 * @module
 */

import { archivePaths, readBlob, type ArchiveLayout } from '@bundle-grep/core'
import { Result } from 'better-result'
import { existsSync } from 'node:fs'

import { toWireError } from '../wire-error'
import { errorResponse } from './respond'

const PREFIX = '/api/blob/'

/** A ref git cannot mistake for an option or a revision expression. */
const REF = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/

function segmentsOf(pathname: string): string[] | undefined {
  return Result.try({
    try: () => pathname.slice(PREFIX.length).split('/').map(decodeURIComponent),
    catch: () => undefined,
  }).unwrapOr(undefined)
}

/**
 * Answers a file request with the file's bytes.
 *
 * The ref is one path segment, such as `HEAD` or a commit id, so a branch
 * name with a slash cannot be used; the path is the rest. The body is always
 * `application/octet-stream` with a `sandbox` content security policy, so a
 * repository's HTML or SVG never runs on the app's origin even if the window
 * is pointed at it.
 */
export async function blobRoute(request: Request, layout: ArchiveLayout): Promise<Response> {
  const segments = segmentsOf(new URL(request.url).pathname)
  const [owner, name, ref, ...rest] = segments ?? []
  const parts = rest.join('/').split('/')
  if (!owner || !name || !ref || !REF.test(ref) || [owner, name, ...parts].some(part => part.includes('\0')) ||
    parts.some(part => part === '' || part === '.' || part === '..')) {
    return errorResponse(400, {
      _tag: 'UsageError',
      message: 'Expected /api/blob/<owner>/<repo>/<ref>/<path>, with a ref such as HEAD or a commit id',
    })
  }
  const path = parts.join('/')

  const paths = archivePaths(layout, owner, name)
  if (paths.isErr()) return errorResponse(400, toWireError(paths.error))
  if (!existsSync(paths.value.gitDir)) {
    return errorResponse(404, { _tag: 'NotFoundError', message: `${owner}/${name} has no search cache` })
  }

  const blob = await readBlob({ gitDir: paths.value.gitDir, ref, path, signal: request.signal })
  if (blob.isErr()) {
    const { error } = blob
    const status =
      error._tag === 'BlobTooLargeError' ? 413 : error._tag === 'BlobNotFoundError' || error.exitCode === 128 ? 404 : 500
    return errorResponse(status, toWireError(error))
  }
  return new Response(blob.value, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-security-policy': 'sandbox',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    },
  })
}
