/**
 * Formats the one-line reports `sync` and `restore` print per repository.
 *
 * @module
 */

import { printable } from './ansi'
import type { Styles } from './format.types'

/** Formats `<status> <repo>`, quiet for repositories that needed nothing done. */
export function formatStatus(status: string, repo: string, styles: Styles): string {
  const label = status.padEnd(9)
  const styled = status === 'unchanged' || status === 'empty' ? styles.dim(label) : styles.green(label)
  return `${styled} ${printable(repo)}\n`
}

/**
 * Formats a failure as `failed <subject>: <message>`.
 *
 * The message is made {@linkcode printable}, as it often quotes git or `gh`,
 * and through them the remote.
 */
export function formatFailure(subject: string, message: string, styles: Styles): string {
  return `${styles.red('failed'.padEnd(9))} ${printable(subject)}: ${printable(message)}\n`
}

/** Formats a `<level>: <message>` line, made {@linkcode printable}. */
export function formatNotice(level: 'error' | 'warning', message: string, styles: Styles): string {
  const label = level === 'error' ? styles.red('error:') : styles.yellow('warning:')
  return `${label} ${printable(message)}\n`
}
