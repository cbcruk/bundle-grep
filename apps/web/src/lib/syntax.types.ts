/**
 * Types for syntax highlighting code lines.
 *
 * @module
 */

import type { CSSProperties } from 'react'

/** A run of a line in one syntax color. */
export interface SyntaxToken {
  /** The run's text. */
  text: string
  /** The run's color and font style, or `undefined` for plain text. */
  style?: CSSProperties
}
