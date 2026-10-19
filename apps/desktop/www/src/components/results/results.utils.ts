/**
 * Formatting for the results summary.
 *
 * @module
 */

/** Writes a count with its noun, such as `1 file` or `1,234 files`. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en')} ${count === 1 ? one : many}`
}
