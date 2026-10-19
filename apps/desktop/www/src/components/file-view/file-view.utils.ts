/**
 * Element ids for the file view.
 *
 * @module
 */

/** The id of a line's row, which scrolling to the line looks up. */
export function lineId(number: number): string {
  return `L${number}`
}
