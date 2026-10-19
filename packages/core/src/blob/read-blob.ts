/**
 * Reads one file from a repository's tree.
 *
 * @module
 */

import { Result } from 'better-result'

import { runGit, splitNul } from '../git/run-git'
import { BlobNotFoundError, BlobTooLargeError } from './blob.errors'
import type { ReadBlobError, ReadBlobOptions } from './blob.types'

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

/**
 * Reads a file's contents from a tree, without a work tree.
 *
 * The entry is looked up with `ls-tree` first, so a directory or submodule at
 * the path is a {@linkcode BlobNotFoundError} rather than a listing, and the
 * size is checked before anything is read. Pathspec magic is turned off, so
 * the path is taken literally.
 *
 * @returns The bytes; a {@linkcode BlobNotFoundError} when the tree has no
 * file there; a {@linkcode BlobTooLargeError} past `maxBytes`; or a `GitError`
 * when the repository or ref cannot be read.
 *
 * @example Reading a README
 * ```ts
 * import { readBlob } from "@bundle-grep/core";
 *
 * const blob = await readBlob({ gitDir: "./cache/cbcruk/barlo.git", ref: "HEAD", path: "README.md" });
 *
 * if (blob.isOk()) console.log(new TextDecoder().decode(blob.value));
 * ```
 */
export async function readBlob(options: ReadBlobOptions): Promise<Result<Uint8Array, ReadBlobError>> {
  const { gitDir, ref, path, maxBytes = DEFAULT_MAX_BYTES, signal } = options
  const notFound = (): Result<Uint8Array, ReadBlobError> =>
    Result.err(new BlobNotFoundError({ path, message: `${ref} has no file ${path}` }))

  const listed = await runGit(['--literal-pathspecs', 'ls-tree', '-l', '-z', '--end-of-options', ref, '--', path], {
    cwd: gitDir,
    signal,
  })
  if (listed.isErr()) return listed
  const entry = splitNul(listed.value.stdout)
    .map(line => /^\d+ (\w+) ([0-9a-f]+) +(\d+|-)\t(.*)$/s.exec(line))
    .find(match => match?.[4] === path)
  if (!entry || entry[1] !== 'blob') return notFound()

  const size = Number(entry[3])
  if (size > maxBytes) {
    return Result.err(new BlobTooLargeError({ path, size, message: `${path} is ${size} bytes, over the ${maxBytes} byte limit` }))
  }
  const read = await runGit(['cat-file', 'blob', entry[2]!], { cwd: gitDir, signal })
  return read.map(({ stdout }) => new Uint8Array(stdout))
}
