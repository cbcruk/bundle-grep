/**
 * Reads ref listings and picks the branch `HEAD` should point to.
 *
 * @module
 */

import { createHash } from 'node:crypto'

/** Lists the branch names in `<object> <refname>` lines, as printed by `for-each-ref` and `bundle list-heads`. */
export function branchesOf(refs: string): string[] {
  return refs.split('\n').flatMap(line => {
    const ref = line.slice(line.indexOf(' ') + 1)
    return ref.startsWith('refs/heads/') ? [ref.slice('refs/heads/'.length)] : []
  })
}

/**
 * Picks the branch `HEAD` should point to.
 *
 * @param preferred The branch to use when it exists, such as the remote's default.
 * @returns `preferred`, else `main`, `master` or the first branch, whichever
 * exists first; `undefined` when there are no branches.
 */
export function chooseHead(preferred: string | null, branches: readonly string[]): string | undefined {
  return [preferred, 'main', 'master', branches[0]].find(
    (branch): branch is string => branch !== null && branch !== undefined && branches.includes(branch),
  )
}

/**
 * Digests a repository's refs and what `HEAD` points to.
 *
 * @param refs `<object> <refname>` lines sorted by refname, each ending in a
 * newline, as `git for-each-ref --format='%(objectname) %(refname)'` prints them.
 * @param symref The ref `HEAD` points to, or `""` when it is detached or unset.
 */
export function refsDigest(refs: string | Buffer, symref: string): string {
  return createHash('sha256').update(refs).update(`HEAD ${symref}\n`).digest('hex')
}
