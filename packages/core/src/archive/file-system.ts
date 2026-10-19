/**
 * Runs file system operations as results.
 *
 * @module
 */

import { Result } from 'better-result'

import { FileSystemError } from './archive.errors'

/** Runs a file system operation on `path`, turning a rejection into a {@linkcode FileSystemError}. */
export function fileSystem<T>(path: string, run: () => Promise<T>): Promise<Result<T, FileSystemError>> {
  return Result.tryPromise({
    try: run,
    catch: cause =>
      new FileSystemError({
        path,
        message: `Could not access ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  })
}
