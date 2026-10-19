/**
 * Types for formatting command output.
 *
 * @module
 */

import type { SearchEvent } from '@bundle-grep/core'

/** A `file` event from {@linkcode search}. */
export type FileEvent = Extract<SearchEvent, { type: 'file' }>

/** The `done` event from {@linkcode search}. */
export type DoneEvent = Extract<SearchEvent, { type: 'done' }>

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
