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
import type { GrepLeaf, PathLeaf, QueryExpr, SearchPlan, SymbolLeaf } from './plan.types'
import { simplify } from './simplify'
import { splitQuery } from './split-query'

type Compiled = Result<QueryExpr, QueryCompileError>

function contentLeaf(pattern: Pattern): GrepLeaf {
  return pattern.kind === 'literal'
    ? { op: 'grep', engine: 'fixed', patterns: [pattern.value], match: 'any' }
    : { op: 'grep', engine: 'pcre', patterns: [pattern.source], match: 'any' }
}

function isValidRegex(source: string, ignoreCase: boolean): Result<void, string> {
  return Result.try({
    try: () => void new RegExp(source, ignoreCase ? 'i' : ''),
    catch: cause => (cause instanceof Error ? cause.message : String(cause)),
  })
}

/**
 * Builds a regex leaf for JavaScript to run from a query's source, honouring
 * a leading `(?-i)`.
 *
 * JavaScript has no inline `(?-i)`, so it is taken off and becomes the flag.
 *
 * @returns The leaf, or the reason JavaScript cannot compile the source.
 */
function regexLeaf<Op extends 'path' | 'symbol'>(op: Op, source: string): Result<{ op: Op; regex: string; ignoreCase: boolean }, string> {
  const caseSensitive = source.startsWith('(?-i)')
  const regex = caseSensitive ? source.slice('(?-i)'.length) : source
  return isValidRegex(regex, !caseSensitive).map(() => ({ op, regex, ignoreCase: !caseSensitive }))
}

function invalidRegex(node: MatchNode, reason: string): QueryCompileError {
  const message = reason.replace(/^Invalid regular expression: (\/.*\/[a-z]*: )?/, '')
  return new QueryCompileError({ message: `Invalid regular expression for ${node.field}: ${message}`, span: node.span })
}

/** Builds the leaf for a `symbol:` qualifier: a literal names a definition exactly, ignoring case. */
function symbolLeaf(node: MatchNode): Result<SymbolLeaf, QueryCompileError> {
  const { pattern } = node
  if (pattern.kind === 'literal') return Result.ok({ op: 'symbol', regex: `^${escapeRegex(pattern.value)}$`, ignoreCase: true })
  return regexLeaf('symbol', pattern.source).mapError(reason => invalidRegex(node, reason))
}

/**
 * Compiles one term or `content:`/`path:` qualifier.
 *
 * A bare term matches the path too, but never as a glob. A regex only PCRE
 * understands keeps just its content half, which git reports on if invalid.
 */
function compileMatch(node: MatchNode): Compiled {
  const { field, pattern } = node

  if (field === 'content') return Result.ok(contentLeaf(pattern))

  if (field === 'symbol') return symbolLeaf(node)

  if (field === 'history') {
    return Result.err(new QueryCompileError({ message: 'history: cannot be negated or combined with OR', span: node.span }))
  }

  if (field === 'path') {
    if (pattern.kind === 'literal') {
      const regex = pattern.quoted ? escapeRegex(pattern.value) : globToRegex(pattern.value)
      return Result.ok({ op: 'path', regex, ignoreCase: true })
    }
    return regexLeaf('path', pattern.source).mapError(reason => invalidRegex(node, reason))
  }

  const path: PathLeaf | undefined =
    pattern.kind === 'literal'
      ? { op: 'path', regex: escapeRegex(pattern.value), ignoreCase: true }
      : regexLeaf('path', pattern.source).unwrapOr(undefined)
  return Result.ok(path ? { op: 'or', children: [contentLeaf(pattern), path] } : contentLeaf(pattern))
}

function compileNode(node: QueryNode): Compiled {
  switch (node.type) {
    case 'match':
      return compileMatch(node)

    case 'filter': {
      if (node.key === 'ref') {
        return Result.err(new QueryCompileError({ message: 'ref: cannot be negated or combined with OR', span: node.span }))
      }
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

interface Highlights {
  patterns: Map<string, Pattern>
  symbols: Map<string, SymbolLeaf>
}

/** Collects the content patterns and `symbol:` leaves under an even number of negations, in query order. */
function collectHighlight(node: QueryNode, positive: boolean, into: Highlights): void {
  switch (node.type) {
    case 'match': {
      if (!positive || node.field === 'path') return
      if (node.field === 'symbol') {
        const leaf = symbolLeaf(node).unwrapOr(undefined)
        const key = leaf && `${leaf.ignoreCase ? 'i' : ''}:${leaf.regex}`
        if (leaf && key && !into.symbols.has(key)) into.symbols.set(key, leaf)
        return
      }
      if (!into.patterns.has(patternKey(node.pattern))) into.patterns.set(patternKey(node.pattern), node.pattern)
      return
    }
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
 * `symbol:` values match definition names, a literal exactly and ignoring
 * case; `language:` resolves through Linguist; and repository qualifiers are
 * left for {@linkcode specializePlan}. A top-level `ref:` and `history:` are
 * taken out by {@linkcode splitQuery}.
 *
 * @returns The plan, or a {@linkcode QueryCompileError} for an unknown
 * language, a `path:` or `symbol:` regex JavaScript cannot compile, or a
 * misplaced `ref:` or `history:`.
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
  return splitQuery(query).andThen(({ query: rest, ref, history }) => {
    const compiled: Compiled = rest ? compileNode(rest) : Result.ok({ op: 'all' })
    return compiled.map(expr => {
      const highlights: Highlights = { patterns: new Map(), symbols: new Map() }
      if (rest) collectHighlight(rest, true, highlights)
      return {
        expr: simplify(expr),
        highlight: [...highlights.patterns.values()],
        symbols: [...highlights.symbols.values()],
        ...(ref !== undefined ? { ref } : {}),
        ...(history ? { history } : {}),
      }
    })
  })
}
