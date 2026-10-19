/**
 * Parses the output of `git grep -n --column -z`.
 *
 * @module
 */

import type { GrepLine } from './search.types'


const NUL = 0
const NEWLINE = 10
const SEPARATOR = Buffer.from('--\n')

function readUntil(output: Buffer, start: number, ...stops: number[]): { end: number; stop: number } {
  let i = start
  while (i < output.length && !stops.includes(output[i]!)) i++
  return { end: i, stop: output[i] ?? -1 }
}

function isDigits(output: Buffer, start: number, end: number): boolean {
  if (start === end) return false
  for (let i = start; i < end; i++) {
    if (output[i]! < 48 || output[i]! > 57) return false
  }
  return true
}

/**
 * Splits `git grep -n --column -z` output into lines.
 *
 * Records are read field by field rather than split on newlines, since a path
 * may contain one: `path\0line\0column\0text\n` for a match,
 * `path\0line\0text\n` for context, and `--\n` between context groups.
 *
 * @param ref The tree argument git was given, whose `<ref>:` prefix every path carries.
 */
export function parseGrepOutput(output: Buffer, ref: string): GrepLine[] {
  const prefix = `${ref}:`
  const lines: GrepLine[] = []
  let i = 0

  while (i < output.length) {
    if (output.subarray(i, i + SEPARATOR.length).equals(SEPARATOR)) {
      i += SEPARATOR.length
      continue
    }

    const path = readUntil(output, i, NUL)
    const rawPath = output.toString('utf8', i, path.end)
    const number = readUntil(output, path.end + 1, NUL)
    const field = readUntil(output, number.end + 1, NUL, NEWLINE)

    let byteColumn: number | undefined
    let textStart = number.end + 1
    if (field.stop === NUL && isDigits(output, number.end + 1, field.end)) {
      byteColumn = Number(output.toString('latin1', number.end + 1, field.end))
      textStart = field.end + 1
    }
    const text = readUntil(output, textStart, NEWLINE)

    lines.push({
      path: rawPath.startsWith(prefix) ? rawPath.slice(prefix.length) : rawPath,
      number: Number(output.toString('latin1', path.end + 1, number.end)),
      byteColumn,
      text: output.toString('utf8', textStart, text.end),
    })
    i = text.end + 1
  }
  return lines
}
