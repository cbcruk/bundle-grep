/**
 * Edits a query the way clicking a sidebar facet does: adding or removing one
 * qualifier while leaving the rest as typed.
 *
 * @module
 */

import { parseQuery, type QueryNode } from '@bundle-grep/core/query'

import type { Facet } from './query-edit.types'

/** Quotes a qualifier value when it would not otherwise read back as one word. */
export function quoteValue(value: string): string {
  return value === '' || /[\s"()\\]/.test(value) ? `"${value.replace(/[\\"]/g, '\\$&')}"` : value
}

/**
 * The `path:` value that selects a top-level directory, as the paths facet
 * names it: `""` is the root, so only files outside any directory.
 */
export function pathValue(directory: string): string {
  if (directory === '') return '/*'
  return /[\s"()\\*?]/.test(directory) ? quoteValue(`${directory}/`) : `/${directory}/**`
}

/** Writes a facet as the qualifier it adds to the query. */
export function facetToken(facet: Facet): string {
  if (facet.kind === 'path') return `path:${pathValue(facet.value)}`
  return `${facet.kind}:${quoteValue(facet.value)}`
}

function normalizeLanguage(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

function conjuncts(tree: QueryNode): QueryNode[] {
  return tree.type === 'and' ? tree.children : [tree]
}

function matches(node: QueryNode, facet: Facet): boolean {
  if (facet.kind === 'path') {
    if (node.type !== 'match' || node.field !== 'path' || node.pattern.kind !== 'literal') return false
    const token = parseQuery(`path:${pathValue(facet.value)}`)
    if (token.isErr() || token.value.type !== 'match' || token.value.pattern.kind !== 'literal') return false
    return node.pattern.value === token.value.pattern.value && node.pattern.quoted === token.value.pattern.quoted
  }
  if (node.type !== 'filter' || node.key !== facet.kind) return false
  return facet.kind === 'language'
    ? normalizeLanguage(node.value) === normalizeLanguage(facet.value)
    : node.value.toLowerCase() === facet.value.toLowerCase()
}

function findFacet(query: string, facet: Facet): QueryNode | undefined {
  const parsed = parseQuery(query)
  if (parsed.isErr()) return undefined
  return conjuncts(parsed.value).find(node => matches(node, facet))
}

/**
 * Says whether the query already narrows to the facet with a top-level
 * qualifier, which is when the sidebar shows it as selected.
 */
export function hasFacet(query: string, facet: Facet): boolean {
  return findFacet(query, facet) !== undefined
}

/**
 * Removes the facet's qualifier if the query has one at the top level, and
 * adds it otherwise.
 *
 * A query whose top level is an `OR` is parenthesised first, since the new
 * qualifier would otherwise bind to its last alternative only. A query that
 * does not parse just has the qualifier appended.
 *
 * @example Narrowing a search, then widening it again
 * ```ts
 * import { toggleFacet } from "./query-edit";
 *
 * toggleFacet("useState", { kind: "language", value: "TypeScript" }); // "useState language:TypeScript"
 * toggleFacet("useState language:typescript", { kind: "language", value: "TypeScript" }); // "useState"
 * ```
 */
export function toggleFacet(query: string, facet: Facet): string {
  const found = findFacet(query, facet)
  if (found) {
    const before = query.slice(0, found.span.offset).trimEnd()
    const after = query.slice(found.span.offset + found.span.length).trimStart()
    const joined = !before || !after || before.endsWith('(') || after.startsWith(')')
    return joined ? before + after : `${before} ${after}`
  }
  const trimmed = query.trim()
  const parsed = parseQuery(trimmed)
  const base = parsed.isOk() && parsed.value.type === 'or' ? `(${trimmed})` : trimmed
  return base ? `${base} ${facetToken(facet)}` : facetToken(facet)
}
