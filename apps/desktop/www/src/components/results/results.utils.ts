/**
 * Formatting and query checks for the results column.
 *
 * @module
 */

import { parseQuery, type QueryNode } from '@bundle-grep/core/query'

function hasField(node: QueryNode, field: string, positive: boolean): boolean {
  if (node.type === 'match') return positive && node.field === field
  if (node.type === 'not') return hasField(node.child, field, !positive)
  if (node.type === 'and' || node.type === 'or') return node.children.some(child => hasField(child, field, positive))
  return false
}

/** Says whether a query looks for definitions: a `symbol:` qualifier under an even number of negations. */
export function usesSymbol(query: string): boolean {
  return parseQuery(query)
    .map(node => hasField(node, 'symbol', true))
    .unwrapOr(false)
}

/** Says whether a query searches commits: a `history:` qualifier that is not negated. */
export function usesHistory(query: string): boolean {
  return parseQuery(query)
    .map(node => hasField(node, 'history', true))
    .unwrapOr(false)
}

/** Writes a count with its noun, such as `1 file` or `1,234 files`. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en')} ${count === 1 ? one : many}`
}
