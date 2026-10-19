/**
 * Reads and writes the metadata JSON kept next to each bundle.
 *
 * @module
 */

import { Result } from 'better-result'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { FileSystemError } from './archive.errors'
import type { RepoMetadata } from './archive.types'

const STRINGS = ['owner', 'name', 'url', 'refsDigest', 'syncedAt'] as const
const BOOLEANS = ['isFork', 'isArchived'] as const
const NULLABLE_STRINGS = ['primaryLanguage', 'description', 'defaultBranch', 'head', 'pushedAt'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMetadata(value: unknown): value is RepoMetadata {
  if (!isRecord(value) || value.version !== 1) return false
  return (
    STRINGS.every(key => typeof value[key] === 'string') &&
    BOOLEANS.every(key => typeof value[key] === 'boolean') &&
    NULLABLE_STRINGS.every(key => value[key] === null || typeof value[key] === 'string') &&
    (value.isPrivate === null || typeof value.isPrivate === 'boolean') &&
    (value.bundleSize === null || typeof value.bundleSize === 'number')
  )
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Reads a repository's metadata file.
 *
 * @returns The metadata; `undefined` when the file does not exist; or a
 * {@linkcode FileSystemError} when it cannot be read or does not hold
 * metadata in the current format.
 */
export async function readMetadata(path: string): Promise<Result<RepoMetadata | undefined, FileSystemError>> {
  const text = await Result.tryPromise({
    try: () => readFile(path, 'utf8'),
    catch: cause => cause,
  })
  if (text.isErr()) {
    if (isRecord(text.error) && text.error.code === 'ENOENT') return Result.ok(undefined)
    return Result.err(new FileSystemError({ path, message: `Could not read ${path}: ${describe(text.error)}` }))
  }
  const value = Result.try(() => JSON.parse(text.value) as unknown)
  if (value.isOk() && isMetadata(value.value)) return Result.ok(value.value)
  return Result.err(new FileSystemError({ path, message: `${path} does not hold repository metadata` }))
}

/**
 * Writes a repository's metadata file, creating its directory as needed.
 *
 * The file is written beside its destination and renamed into place, so a
 * reader never sees half of it.
 */
export async function writeMetadata(path: string, metadata: RepoMetadata): Promise<Result<void, FileSystemError>> {
  const temporary = `${path}.tmp`
  return Result.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`)
      await rename(temporary, path)
    },
    catch: cause => new FileSystemError({ path, message: `Could not write ${path}: ${describe(cause)}` }),
  })
}
