/**
 * Types for formatting command output.
 *
 * @module
 */

/** Turns text into styled text. */
export type Style = (text: string) => string

/** The text styles commands use, from {@linkcode stylesFor}. */
export interface Styles {
  /** Repository names and headings. */
  bold: Style
  /** Context lines and quiet notes. */
  dim: Style
  /** Matches and errors. */
  red: Style
  /** Created or updated repositories. */
  green: Style
  /** Warnings. */
  yellow: Style
  /** Line numbers and paths. */
  magenta: Style
}
