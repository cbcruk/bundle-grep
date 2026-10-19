/**
 * Normalizes plan expressions so they run as few `git grep`s as possible.
 *
 * @module
 */

import type { Expr, GrepLeaf } from './plan.types'

type Node<Leaf> = Expr<Leaf | GrepLeaf>

function isGrep<Leaf extends { op: string }>(node: Node<Leaf>): node is GrepLeaf {
  return node.op === 'grep'
}

function opOf<Leaf extends { op: string }>(node: Node<Leaf>): string {
  return node.op
}

/**
 * Folds `grep` children of one engine into a single leaf.
 *
 * Under `and` they become one `--all-match` grep and under `or` one grep with
 * several patterns, which is the same file set from one process.
 */
function mergeGreps<Leaf extends { op: string }>(op: 'and' | 'or', children: Node<Leaf>[]): Node<Leaf>[] {
  const match = op === 'and' ? 'all' : 'any'
  const merged = new Map<GrepLeaf['engine'], GrepLeaf>()
  const rest: Node<Leaf>[] = []

  for (const child of children) {
    if (!isGrep(child) || (child.match !== match && child.patterns.length > 1)) {
      rest.push(child)
      continue
    }
    const existing = merged.get(child.engine)
    if (existing) {
      existing.patterns.push(...child.patterns.filter(pattern => !existing.patterns.includes(pattern)))
      if (existing.patterns.length > 1) existing.match = match
    } else {
      merged.set(child.engine, { ...child, patterns: [...child.patterns] })
    }
  }
  return [...merged.values(), ...rest]
}

/**
 * Simplifies an expression without changing which files it selects.
 *
 * Flattens nested `and`/`or`, absorbs `all` and `none`, cancels double
 * negation, and merges `grep` leaves.
 */
export function simplify<Leaf extends { op: string }>(node: Node<Leaf>): Node<Leaf> {
  const op = opOf(node)

  if (op === 'not') {
    const child = simplify((node as { child: Node<Leaf> }).child)
    const childOp = opOf(child)
    if (childOp === 'all') return { op: 'none' } as Node<Leaf>
    if (childOp === 'none') return { op: 'all' } as Node<Leaf>
    if (childOp === 'not') return (child as { child: Node<Leaf> }).child
    return { op: 'not', child }
  }

  if (op !== 'and' && op !== 'or') return node

  const identity = op === 'and' ? 'all' : 'none'
  const absorbing = op === 'and' ? 'none' : 'all'
  const children: Node<Leaf>[] = []

  for (const raw of (node as { children: Node<Leaf>[] }).children) {
    const child = simplify(raw)
    const childOp = opOf(child)
    if (childOp === absorbing) return child
    if (childOp === identity) continue
    if (childOp === op) children.push(...(child as { children: Node<Leaf>[] }).children)
    else children.push(child)
  }

  const merged = mergeGreps(op, children)
  if (merged.length === 0) return { op: identity } as Node<Leaf>
  if (merged.length === 1) return merged[0]!
  return { op, children: merged }
}
