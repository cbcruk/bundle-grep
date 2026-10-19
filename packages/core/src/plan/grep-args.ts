/**
 * Builds `git grep` arguments for a {@linkcode GrepLeaf}.
 *
 * @module
 */

import type { GrepLeaf } from './plan.types'

/**
 * Returns the pattern arguments for `git grep` that select a leaf's files.
 *
 * Matching is case-insensitive, as on GitHub; a PCRE pattern can opt out with
 * `(?-i)`. Every pattern goes through `-e`, so one starting with `-` is not
 * read as an option. Output and revision arguments are the caller's.
 */
export function grepArgs(leaf: GrepLeaf): string[] {
  return [
    '-i',
    leaf.engine === 'fixed' ? '-F' : '-P',
    ...(leaf.match === 'all' && leaf.patterns.length > 1 ? ['--all-match'] : []),
    ...leaf.patterns.flatMap(pattern => ['-e', pattern]),
  ]
}
