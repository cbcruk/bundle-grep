/**
 * Styles terminal text with ANSI escapes, or leaves it plain.
 *
 * @module
 */

import type { Style, Styles } from './format.types'

const CODES = { bold: [1, 22], dim: [2, 22], red: [31, 39], green: [32, 39], yellow: [33, 39], magenta: [35, 39] } as const

/**
 * Builds the text styles for a terminal.
 *
 * @param color Whether to emit escapes; when `false` every style returns its text unchanged.
 */
export function stylesFor(color: boolean): Styles {
  const style =
    ([open, close]: readonly [number, number]): Style =>
    (text: string): string =>
      color ? `\x1b[${open}m${text}\x1b[${close}m` : text
  return {
    bold: style(CODES.bold),
    dim: style(CODES.dim),
    red: style(CODES.red),
    green: style(CODES.green),
    yellow: style(CODES.yellow),
    magenta: style(CODES.magenta),
  }
}

/**
 * Replaces control characters with `�`, so text from a repository cannot
 * move the cursor or retitle the terminal.
 *
 * Tabs are kept. Every replaced character is one UTF-16 code unit and so is
 * its replacement, so ranges into the text still line up.
 */
export function printable(text: string): string {
  return text.replace(/\p{Cc}/gu, char => (char === '\t' ? char : '\ufffd'))
}
