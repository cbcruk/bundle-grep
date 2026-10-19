/**
 * The `list` command: shows the archived repositories and their metadata.
 *
 * @module
 */

import { loadArchivedRepos, readMetadata, type ArchiveEntry, type RepoMetadata } from '@bundle-grep/core'

import { parseCommandArgs } from '../args'
import type { Command, Io } from '../cli.types'
import { EXIT } from '../exit-codes'
import { printable, stylesFor } from '../format/ansi'
import { formatNotice } from '../format/status-line'
import { layoutFor } from '../layout'
import type { ListRow, ListState } from './commands.types'

const USAGE = `Usage: bundle-grep list [options]

Lists the archived repositories: whether each can be searched, and what was
recorded when it was synced.

States:
  ready        restored and searchable
  unrestored   archived, but needs \`bundle-grep restore\`
  empty        had no commits when synced

Options:
  --root <dir>     where the archive lives (default $BUNDLE_GREP_ROOT or ~/.bundle-grep)
  --json           print a JSON array
  -h, --help       show this help
`

function flagsOf(metadata: RepoMetadata | null): string {
  if (!metadata) return ''
  return [metadata.isFork && 'fork', metadata.isArchived && 'archived', metadata.isPrivate && 'private'].filter(Boolean).join(',')
}

async function rowOf(entry: ArchiveEntry, state: ListState): Promise<ListRow> {
  const metadata = await readMetadata(entry.paths.metadata)
  return { name: `${entry.owner}/${entry.name}`, state, metadata: metadata.unwrapOr(undefined) ?? null }
}

async function run(args: string[], io: Io): Promise<number> {
  const styles = stylesFor(io.color)
  const errors = stylesFor(io.errorColor)
  const parsed = parseCommandArgs(args, {})
  if (parsed.isErr()) {
    io.error(`${parsed.error.message}\n\n${USAGE}`)
    return EXIT.error
  }
  const { values, positionals } = parsed.value
  if (values.help) {
    io.write(USAGE)
    return EXIT.ok
  }
  if (positionals.length > 0) {
    io.error(`Unexpected argument "${positionals[0]}"\n\n${USAGE}`)
    return EXIT.error
  }

  const loaded = await loadArchivedRepos(layoutFor(values.root, io.env))
  if (loaded.isErr()) {
    io.error(formatNotice('error', loaded.error.message, errors))
    return EXIT.error
  }
  const { repos, unrestored, empty, invalid } = loaded.value
  const rows: ListRow[] = [
    ...repos.map(repo => ({ name: repo.name, state: 'ready' as const, metadata: repo.metadata ?? null })),
    ...(await Promise.all(unrestored.map(entry => rowOf(entry, 'unrestored')))),
    ...(await Promise.all(empty.map(entry => rowOf(entry, 'empty')))),
  ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const error of invalid) io.error(formatNotice('warning', error.message, errors))
  if (rows.length === 0 && invalid.length === 0) {
    io.error(formatNotice('warning', 'nothing is archived yet; run `bundle-grep sync <owner>` first', errors))
  }

  if (values.json) {
    io.write(`${JSON.stringify(rows, null, 2)}\n`)
  } else {
    const width = Math.max(0, ...rows.map(row => row.name.length))
    for (const row of rows) {
      const state = row.state === 'ready' ? styles.green(row.state.padEnd(10)) : styles.yellow(row.state.padEnd(10))
      const details = [row.metadata?.primaryLanguage, flagsOf(row.metadata), row.metadata && `synced ${row.metadata.syncedAt.slice(0, 10)}`]
      const shown = details.filter(Boolean).join('  ')
      io.write(`${printable(row.name.padEnd(width))}  ${state}${shown ? `  ${styles.dim(printable(shown))}` : ''}\n`)
    }
  }
  return invalid.length > 0 ? EXIT.none : EXIT.ok
}

/** `bundle-grep list`. */
export const listCommand: Command = { name: 'list', summary: 'show archived repositories', usage: USAGE, run }
