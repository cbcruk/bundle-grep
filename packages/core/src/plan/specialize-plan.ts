/**
 * Settles a plan's repository qualifiers for one repository.
 *
 * @module
 */

import type { FileExpr, FilterLeaf, QueryExpr } from './plan.types'
import { simplify } from './simplify'

function replaceFilters(expr: QueryExpr, holds: (filter: FilterLeaf) => boolean): FileExpr {
  switch (expr.op) {
    case 'filter':
      return { op: holds(expr) ? 'all' : 'none' }
    case 'not':
      return { op: 'not', child: replaceFilters(expr.child, holds) }
    case 'and':
    case 'or':
      return { op: expr.op, children: expr.children.map(child => replaceFilters(child, holds)) }
    default:
      return expr
  }
}

/**
 * Replaces every repository qualifier with whether it holds for one
 * repository, and simplifies what is left.
 *
 * A result of `{ op: "none" }` means the repository cannot contain a match and
 * need not be searched at all.
 *
 * @param holds Says whether a qualifier such as `repo:owner/name` or `is:fork`
 * is true of the repository being searched.
 *
 * @example Skipping repositories a query rules out
 * ```ts
 * import { compileQuery, parseQuery, specializePlan } from "@bundle-grep/core";
 *
 * const plan = parseQuery("useState repo:cbcruk/barlo").andThen(compileQuery).unwrap();
 * const expr = specializePlan(plan.expr, filter => filter.key === "repo" && filter.value === "cbcruk/ese");
 *
 * expr.op; // "none"
 * ```
 */
export function specializePlan(expr: QueryExpr, holds: (filter: FilterLeaf) => boolean): FileExpr {
  return simplify(replaceFilters(expr, holds))
}
