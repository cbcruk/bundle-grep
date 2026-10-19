/**
 * Expands a leading `~` the way a shell would have.
 *
 * @module
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Replaces a leading `~` or `~/` with the home directory, for paths that
 * reached the program without a shell expanding them, such as a quoted
 * argument or an environment variable.
 *
 * `~user` forms are left alone.
 */
export function expandHome(path: string): string {
  if (path === '~') return homedir()
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
}
