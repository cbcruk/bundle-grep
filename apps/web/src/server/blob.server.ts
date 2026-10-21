/**
 * Reads one file from a search cache.
 *
 * @module
 */

import { archivePaths, readBlob, type ArchiveLayout } from '@bundle-grep/core'
import { existsSync } from 'node:fs'

import type { ApiResult, BlobContent, BlobInput } from '../api/api.types'
import { blobLines } from '../lib/blob-text'
import { toWireError } from '../lib/wire-error'

/**
 * Reads a file at a commit, or at `HEAD`, as lines or as a binary file's size.
 *
 * The repository must be `owner/name` and the path a plain relative one,
 * with no empty, `.`, or `..` segment.
 */
export async function readFileContent(input: BlobInput, layout: ArchiveLayout, signal?: AbortSignal): Promise<ApiResult<BlobContent>> {
  const [owner, name, ...extra] = input.repo.split('/')
  const parts = input.path.split('/')
  if (!owner || !name || extra.length > 0 || [input.repo, input.path].some(text => text.includes('\0')) ||
    parts.some(part => part === '' || part === '.' || part === '..')) {
    return { ok: false, error: { _tag: 'UsageError', message: `Cannot read ${input.repo}/${input.path}` } }
  }
  const paths = archivePaths(layout, owner, name)
  if (paths.isErr()) return { ok: false, error: toWireError(paths.error) }
  if (!existsSync(paths.value.gitDir)) {
    return { ok: false, error: { _tag: 'NotFoundError', message: `${owner}/${name} has no search cache` } }
  }
  const blob = await readBlob({ gitDir: paths.value.gitDir, ref: input.ref ?? 'HEAD', path: input.path, signal })
  if (blob.isErr()) {
    const { error } = blob
    const missing = error._tag === 'GitError' && error.exitCode === 128
    return { ok: false, error: missing ? { _tag: 'BlobNotFoundError', message: `${input.path} is not in ${input.repo} at that commit` } : toWireError(error) }
  }
  const lines = blobLines(blob.value)
  return { ok: true, value: lines ? { kind: 'text', lines } : { kind: 'binary', size: blob.value.byteLength } }
}
