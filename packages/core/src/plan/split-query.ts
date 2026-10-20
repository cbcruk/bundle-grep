/**
 * Takes `ref:` and `history:` out of a parsed query, since they choose what
 * is searched rather than which files match.
 *
 * @module
 */

import { Result } from 'better-result'

import type { FilterNode, MatchNode, QueryNode } from '../query/query.types'
import { escapeRegex } from './path-regex'
import { QueryCompileError } from './plan.errors'
import type { HistoryPattern, SplitQuery } from './plan.types'

/** A revision git cannot read as an option, a range, or a path inside a tree. */
const REF = /^(?!-)(?!.*\.\.)[^\s:\\{}]+$/

function fail<T>(message: string, node: QueryNode): Result<T, QueryCompileError> {
  return Result.err(new QueryCompileError({ message, span: node.span }))
}

function isRef(node: QueryNode): node is FilterNode {
  return node.type === 'filter' && node.key === 'ref'
}

function isHistory(node: QueryNode): node is MatchNode {
  return node.type === 'match' && node.field === 'history'
}

/** Finds the first node below the top level that holds, in query order. */
function findNested(node: QueryNode, test: (node: QueryNode) => boolean): QueryNode | undefined {
  if (test(node)) return node
  if (node.type === 'not') return findNested(node.child, test)
  if (node.type === 'and' || node.type === 'or') {
    for (const child of node.children) {
      const found = findNested(child, test)
      if (found) return found
    }
  }
  return undefined
}

function historyPattern(node: MatchNode): HistoryPattern {
  const { pattern } = node
  if (pattern.kind === 'literal') return { regex: escapeRegex(pattern.value), ignoreCase: true, pattern }
  const caseSensitive = pattern.source.startsWith('(?-i)')
  return { regex: caseSensitive ? pattern.source.slice('(?-i)'.length) : pattern.source, ignoreCase: !caseSensitive, pattern }
}

/**
 * Splits a query into the `ref:` and `history:` it holds at the top level and
 * the rest.
 *
 * Both must be top-level terms — not negated, not inside `OR` — and appear at
 * most once. Beside `history:`, only `path:`, `language:`, and repository
 * qualifiers may appear, since a change is matched by its lines, not by the
 * files a commit leaves behind.
 *
 * @returns The parts, or a {@linkcode QueryCompileError} pointing at the term
 * that breaks a rule or a `ref:` git could misread.
 */
export function splitQuery(query: QueryNode): Result<SplitQuery, QueryCompileError> {
  const conjuncts = query.type === 'and' ? query.children : [query]
  const rest: QueryNode[] = []
  let ref: string | undefined
  let history: MatchNode | undefined

  for (const node of conjuncts) {
    if (isRef(node)) {
      if (ref !== undefined) return fail('Only one ref: can be searched at a time', node)
      if (!REF.test(node.value)) return fail(`"${node.value}" is not a branch, tag, or commit`, node)
      ref = node.value
    } else if (isHistory(node)) {
      if (history) return fail('Only one history: can be searched at a time', node)
      history = node
    } else {
      rest.push(node)
    }
  }

  for (const node of rest) {
    const nested = findNested(node, candidate => isRef(candidate) || isHistory(candidate))
    if (nested) {
      const key = isRef(nested) ? 'ref' : 'history'
      return fail(`${key}: cannot be negated or combined with OR`, nested)
    }
    const other = history && findNested(node, candidate => candidate.type === 'match' && candidate.field !== 'path')
    if (other) return fail('history: can only be combined with path:, language:, repo:, org:, user:, is:, and ref:', other)
  }

  const remaining: QueryNode | undefined =
    rest.length === 0 ? undefined : rest.length === 1 ? rest[0] : { type: 'and', children: rest, span: query.span }
  return Result.ok({
    ...(remaining ? { query: remaining } : {}),
    ...(ref !== undefined ? { ref } : {}),
    ...(history ? { history: historyPattern(history) } : {}),
  })
}
