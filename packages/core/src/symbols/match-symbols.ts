/**
 * Tests definitions against `symbol:` leaves.
 *
 * @module
 */

import type { SymbolLeaf } from '../plan/plan.types'
import type { SymbolDefinition } from './symbols.types'

/** A separator in a leaf's pattern, `::` or an escaped `.`, which makes it name a qualified definition. */
const QUALIFIED = /::|\\\./

/** Lists a qualified name and each shorter name it ends in, in both separators: `A::B::c`, `A.B.c`, `B::c`, `B.c`, `c`. */
function namesOf(qualified: string): string[] {
  const parts = qualified.split(/::|\./)
  return parts.flatMap((_, index) => {
    const rest = parts.slice(index)
    return index === parts.length - 1 ? rest : [rest.join('::'), rest.join('.')]
  })
}

/**
 * Builds a test for whether a definition matches any of the leaves.
 *
 * A leaf is tested against the definition's name. A leaf whose pattern holds
 * a separator, `::` or an escaped `.`, as `symbol:Maint.deleteRows` and
 * `symbol:/^String::to_/` do, is also tested against its
 * {@linkcode SymbolDefinition.qualified} name and each shorter name that name
 * ends in, written with either separator, so `Maint.deleteRows` matches a Go
 * method on `Maint` and `Maint::deleteRows` a Rust one, even inside a module.
 *
 * @returns A function that is `true` for a matching definition; with no
 * leaves, it is never `true`.
 */
export function symbolMatcher(leaves: readonly SymbolLeaf[]): (symbol: SymbolDefinition) => boolean {
  const tests = leaves.map(leaf => ({ regex: new RegExp(leaf.regex, leaf.ignoreCase ? 'i' : ''), qualified: QUALIFIED.test(leaf.regex) }))
  const qualifies = tests.some(({ qualified }) => qualified)
  return symbol => {
    const names = qualifies && symbol.qualified !== undefined ? namesOf(symbol.qualified) : undefined
    return tests.some(({ regex, qualified }) => regex.test(symbol.name) || (qualified && names !== undefined && names.some(name => regex.test(name))))
  }
}
