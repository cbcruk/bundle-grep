/**
 * Tests paths against the parts of an expression that need nothing but the path.
 *
 * @module
 */

import type { FileExpr, LanguageLeaf } from './plan.types'

/** Says whether a path belongs to a `language:` leaf, by extension or exact filename, ignoring case. */
export function matchesLanguage(leaf: LanguageLeaf, path: string): boolean {
  const lower = path.toLowerCase()
  const name = lower.slice(lower.lastIndexOf('/') + 1)
  return (
    leaf.extensions.some(extension => lower.endsWith(extension.toLowerCase())) ||
    leaf.filenames.some(filename => name === filename.toLowerCase())
  )
}

/**
 * Evaluates an expression of `path:` and `language:` leaves for one path, as
 * `history:` narrows the files a commit changed.
 *
 * Leaves that look at contents or definitions cannot be decided from a path
 * and hold for none; {@linkcode compileQuery} keeps them out of a `history:`
 * query.
 */
export function matchesPath(expr: FileExpr, path: string): boolean {
  switch (expr.op) {
    case 'all':
      return true
    case 'path':
      return new RegExp(expr.regex, expr.ignoreCase ? 'i' : '').test(path)
    case 'language':
      return matchesLanguage(expr, path)
    case 'not':
      return !matchesPath(expr.child, path)
    case 'and':
      return expr.children.every(child => matchesPath(child, path))
    case 'or':
      return expr.children.some(child => matchesPath(child, path))
    default:
      return false
  }
}
