/**
 * Formatting and query checks for the results column.
 *
 * @module
 */

import { parseQuery, type QueryNode } from '@bundle-grep/core/query'

function hasSymbol(node: QueryNode): boolean {
  if (node.type === 'match') return node.field === 'symbol'
  if (node.type === 'not') return hasSymbol(node.child)
  if (node.type === 'and' || node.type === 'or') return node.children.some(hasSymbol)
  return false
}

/** Says whether a query has a `symbol:` qualifier, negated or not. */
export function usesSymbol(query: string): boolean {
  return parseQuery(query).map(hasSymbol).unwrapOr(false)
}

/** Writes a count with its noun, such as `1 file` or `1,234 files`. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en')} ${count === 1 ? one : many}`
}
