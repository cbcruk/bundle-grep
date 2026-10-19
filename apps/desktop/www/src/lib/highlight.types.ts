/**
 * Types for highlighting matches in result lines.
 *
 * @module
 */

/** A run of a line that is either all highlighted or all plain. */
export interface Segment {
  /** The run's text. */
  text: string
  /** `true` when the run is part of a match. */
  match: boolean
}
