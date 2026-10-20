/**
 * Formatting and query checks for the results column.
 *
 * @module
 */

import { parseQuery, type QueryNode } from '@bundle-grep/core/query'

function hasSymbol(node: QueryNode, positive: boolean): boolean {
  if (node.type === 'match') return positive && node.field === 'symbol'
  if (node.type === 'not') return hasSymbol(node.child, !positive)
  if (node.type === 'and' || node.type === 'or') return node.children.some(child => hasSymbol(child, positive))
  return false
}

/** Says whether a query looks for definitions: a `symbol:` qualifier under an even number of negations. */
export function usesSymbol(query: string): boolean {
  return parseQuery(query)
    .map(node => hasSymbol(node, true))
    .unwrapOr(false)
}

/** Writes a count with its noun, such as `1 file` or `1,234 files`. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en')} ${count === 1 ? one : many}`
}
