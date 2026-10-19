/**
 * Compiles a parsed query into a {@linkcode SearchPlan}.
 *
 * @module
 */

import { Result } from 'better-result'

import type { MatchNode, Pattern, QueryNode } from '../query/query.types'
import { findLanguage } from './languages'
import { escapeRegex, globToRegex } from './path-regex'
import { QueryCompileError } from './plan.errors'
import type { GrepLeaf, PathLeaf, QueryExpr, SearchPlan } from './plan.types'
import { simplify } from './simplify'

type Compiled = Result<QueryExpr, QueryCompileError>

function contentLeaf(pattern: Pattern): GrepLeaf {
  return pattern.kind === 'literal'
    ? { op: 'grep', engine: 'fixed', patterns: [pattern.value], match: 'any' }
    : { op: 'grep', engine: 'pcre', patterns: [pattern.source], match: 'any' }
}

function isValidRegex(source: string): Result<void, string> {
  return Result.try({
    try: () => void new RegExp(source, 'i'),
    catch: cause => (cause instanceof Error ? cause.message : String(cause)),
  })
}

function compileMatch(node: MatchNode): Compiled {
  const { field, pattern } = node

  if (field === 'content') return Result.ok(contentLeaf(pattern))

  if (field === 'path') {
    if (pattern.kind === 'literal') {
      const regex = pattern.quoted ? escapeRegex(pattern.value) : globToRegex(pattern.value)
      return Result.ok({ op: 'path', regex })
    }
    const valid = isValidRegex(pattern.source)
    if (valid.isErr()) {
      const reason = valid.error.replace(/^Invalid regular expression: (\/.*\/[a-z]*: )?/, '')
      return Result.err(
        new QueryCompileError({ message: `Invalid regular expression for path: ${reason}`, span: node.span }),
      )
    }
    return Result.ok({ op: 'path', regex: pattern.source })
  }

  // A bare term matches the path too, but never as a glob. A regex that only
  // PCRE understands, such as `(?-i)`, keeps its content half.
  const path: PathLeaf | undefined =
    pattern.kind === 'literal'
      ? { op: 'path', regex: escapeRegex(pattern.value) }
      : isValidRegex(pattern.source).isOk()
        ? { op: 'path', regex: pattern.source }
        : undefined
  return Result.ok(path ? { op: 'or', children: [contentLeaf(pattern), path] } : contentLeaf(pattern))
}

function compileNode(node: QueryNode): Compiled {
  switch (node.type) {
    case 'match':
      return compileMatch(node)

    case 'filter': {
      if (node.key !== 'language') return Result.ok({ op: 'filter', key: node.key, value: node.value })
      const language = findLanguage(node.value)
      if (!language) {
        return Result.err(new QueryCompileError({ message: `Unknown language "${node.value}"`, span: node.span }))
      }
      return Result.ok({
        op: 'language',
        language: language.name,
        extensions: language.extensions,
        filenames: language.filenames,
      })
    }

    case 'not':
      return compileNode(node.child).map(child => ({ op: 'not', child }))

    case 'and':
    case 'or': {
      const children: QueryExpr[] = []
      for (const child of node.children) {
        const compiled = compileNode(child)
        if (compiled.isErr()) return compiled
        children.push(compiled.value)
      }
      return Result.ok({ op: node.type, children })
    }
  }
}

function patternKey(pattern: Pattern): string {
  return pattern.kind === 'literal' ? `literal:${pattern.value}` : `regex:${pattern.source}`
}

/** Collects the content patterns under an even number of negations, in query order. */
function collectHighlight(node: QueryNode, positive: boolean, into: Map<string, Pattern>): void {
  switch (node.type) {
    case 'match':
      if (positive && node.field !== 'path' && !into.has(patternKey(node.pattern))) {
        into.set(patternKey(node.pattern), node.pattern)
      }
      return
    case 'filter':
      return
    case 'not':
      collectHighlight(node.child, !positive, into)
      return
    case 'and':
    case 'or':
      for (const child of node.children) collectHighlight(child, positive, into)
  }
}

/**
 * Compiles a parsed query into the file-set expression that answers it.
 *
 * Content patterns become `git grep` leaves, matched case-insensitively as on
 * GitHub; `path:` values become path regexes following GitHub's glob rules;
 * `language:` resolves through Linguist; and repository qualifiers are left
 * for {@linkcode specializePlan}.
 *
 * @returns The plan, or a {@linkcode QueryCompileError} for an unknown
 * language or a `path:` regex JavaScript cannot compile.
 *
 * @example Compiling a query
 * ```ts
 * import { compileQuery, parseQuery } from "@bundle-grep/core";
 *
 * const plan = parseQuery("useState language:typescript").andThen(compileQuery);
 *
 * if (plan.isOk()) console.log(plan.value.expr.op); // "and"
 * ```
 */
export function compileQuery(query: QueryNode): Result<SearchPlan, QueryCompileError> {
  return compileNode(query).map(expr => {
    const highlight = new Map<string, Pattern>()
    collectHighlight(query, true, highlight)
    return { expr: simplify(expr), highlight: [...highlight.values()] }
  })
}
