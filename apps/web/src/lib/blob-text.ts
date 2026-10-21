/**
 * Turns a file's bytes into lines for the file view.
 *
 * @module
 */

/** How far git looks for a NUL byte when deciding a file is binary. */
const SNIFF_BYTES = 8000

/**
 * Splits a file into lines, or says it is binary.
 *
 * A file with a NUL byte in its first 8000 bytes is binary, as git decides.
 * Text is decoded as UTF-8, with invalid bytes replaced; a trailing newline
 * does not start an extra line, and `\r\n` endings lose their `\r`.
 *
 * @returns The lines, or `undefined` for a binary file.
 */
export function blobLines(bytes: Uint8Array): string[] | undefined {
  if (bytes.subarray(0, SNIFF_BYTES).includes(0)) return undefined
  const text = new TextDecoder('utf-8').decode(bytes)
  if (text === '') return []
  const lines = text.split('\n').map(line => (line.endsWith('\r') ? line.slice(0, -1) : line))
  if (lines.at(-1) === '') lines.pop()
  return lines
}
