/**
 * Names files to git exactly, within the command-line length every platform
 * allows.
 *
 * @module
 */

/**
 * Most bytes of `:(literal)` pathspecs to put on one command line. Kept well
 * under Windows' 32 KiB limit, the smallest of the platforms git runs on.
 */
export const MAX_PATHSPEC_BYTES = 24 * 1024

/**
 * Turns paths into `:(literal)` pathspecs, split into runs that each fit in
 * {@linkcode MAX_PATHSPEC_BYTES}.
 *
 * @returns One run per command line, in order; none for no paths.
 */
export function literalPathspecChunks(paths: readonly string[]): string[][] {
  const chunks: string[][] = []
  let chunk: string[] = []
  let bytes = 0
  for (const path of paths) {
    const pathspec = `:(literal)${path}`
    const size = Buffer.byteLength(pathspec) + 1
    if (chunk.length > 0 && bytes + size > MAX_PATHSPEC_BYTES) {
      chunks.push(chunk)
      chunk = []
      bytes = 0
    }
    chunk.push(pathspec)
    bytes += size
  }
  if (chunk.length > 0) chunks.push(chunk)
  return chunks
}
