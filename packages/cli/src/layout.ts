/**
 * Decides where the archive and its search caches live.
 *
 * @module
 */

import { expandHome, type ArchiveLayout } from '@bundle-grep/core'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Resolves the archive and cache directories under one root.
 *
 * The root is `--root` when given, then `BUNDLE_GREP_ROOT`, then
 * `~/.bundle-grep`; a leading `~` is expanded. Bundles and metadata go in `<root>/archive` and search
 * caches in `<root>/cache`.
 */
export function layoutFor(root: string | undefined, env: Record<string, string | undefined>): ArchiveLayout {
  const base = resolve(expandHome(root ?? (env.BUNDLE_GREP_ROOT || join(homedir(), '.bundle-grep'))))
  return { archiveDir: join(base, 'archive'), cacheDir: join(base, 'cache') }
}
