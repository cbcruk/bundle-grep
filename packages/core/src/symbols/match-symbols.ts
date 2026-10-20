/**
 * Tests definitions against `symbol:` leaves.
 *
 * @module
 */

import type { SymbolLeaf } from '../plan/plan.types'
import type { SymbolDefinition } from './symbols.types'

/**
 * Builds a test for whether a definition's name matches any of the leaves.
 *
 * @returns A function that is `true` for a matching definition; with no
 * leaves, it is never `true`.
 */
export function symbolMatcher(leaves: readonly SymbolLeaf[]): (symbol: SymbolDefinition) => boolean {
  const regexes = leaves.map(leaf => new RegExp(leaf.regex, leaf.ignoreCase ? 'i' : ''))
  return symbol => regexes.some(regex => regex.test(symbol.name))
}
