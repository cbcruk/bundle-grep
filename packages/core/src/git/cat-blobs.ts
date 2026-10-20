/**
 * Reads many blobs from a repository with one git process.
 *
 * @module
 */

import { Result } from 'better-result'

import type { GitError } from './git.errors'
import { runGit } from './run-git'

const HEADER = /^([0-9a-f]+) (?:blob|tree|commit|tag) (\d+)$/

/**
 * Reads blobs by object name with `git cat-file --batch`, handing each one
 * over as soon as it has arrived.
 *
 * Output is parsed as it streams, so only one blob is held in memory at a
 * time. Objects that are missing are skipped, and no names at all run no
 * git. `onBlob` runs synchronously inside git's output handler and must not
 * throw.
 *
 * @returns Nothing once every blob was handed over, or a {@linkcode GitError}
 * when git fails or is stopped.
 */
export async function catBlobs(
  gitDir: string,
  oids: readonly string[],
  onBlob: (oid: string, content: Buffer) => void,
  signal?: AbortSignal,
): Promise<Result<void, GitError>> {
  if (oids.length === 0) return Result.ok()
  let chunks: Buffer[] = []
  let length = 0
  let next: { oid: string; size: number } | undefined

  const joined = (): Buffer => {
    if (chunks.length > 1) chunks = [Buffer.concat(chunks, length)]
    return chunks[0] ?? Buffer.alloc(0)
  }
  const keep = (rest: Buffer): void => {
    chunks = rest.length ? [rest] : []
    length = rest.length
  }

  const drain = (): void => {
    for (;;) {
      if (!next) {
        const buffer = joined()
        const newline = buffer.indexOf(10)
        if (newline === -1) return
        const match = HEADER.exec(buffer.toString('utf8', 0, newline))
        keep(buffer.subarray(newline + 1))
        if (match) next = { oid: match[1]!, size: Number(match[2]) }
        continue
      }
      if (length < next.size + 1) return
      const buffer = joined()
      onBlob(next.oid, buffer.subarray(0, next.size))
      keep(buffer.subarray(next.size + 1))
      next = undefined
    }
  }

  const result = await runGit(['cat-file', '--batch'], {
    cwd: gitDir,
    input: oids.map(oid => `${oid}\n`).join(''),
    onStdout: chunk => {
      chunks.push(chunk)
      length += chunk.length
      drain()
    },
    signal,
  })
  return result.map(() => undefined)
}
