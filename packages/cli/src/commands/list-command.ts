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
import { layoutFor } from '../layout'

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

/** Whether a listed repository can be searched. */
type State = 'ready' | 'unrestored' | 'empty'

interface Row {
  name: string
  state: State
  metadata: RepoMetadata | null
}

function flagsOf(metadata: RepoMetadata | null): string {
  if (!metadata) return ''
  return [metadata.isFork && 'fork', metadata.isArchived && 'archived', metadata.isPrivate && 'private'].filter(Boolean).join(',')
}

async function rowOf(entry: ArchiveEntry, state: State): Promise<Row> {
  const metadata = await readMetadata(entry.paths.metadata)
  return { name: `${entry.owner}/${entry.name}`, state, metadata: metadata.unwrapOr(undefined) ?? null }
}

async function run(args: string[], io: Io): Promise<number> {
  const styles = stylesFor(io.color)
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
    io.error(`${styles.red('error:')} ${loaded.error.message}\n`)
    return EXIT.error
  }
  const { repos, unrestored, empty, invalid } = loaded.value
  const rows = [
    ...repos.map(repo => ({ name: repo.name, state: 'ready' as const, metadata: repo.metadata ?? null })),
    ...(await Promise.all(unrestored.map(entry => rowOf(entry, 'unrestored')))),
    ...(await Promise.all(empty.map(entry => rowOf(entry, 'empty')))),
  ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const error of invalid) io.error(`${styles.yellow('warning:')} ${error.message}\n`)

  if (values.json) {
    io.write(`${JSON.stringify(rows, null, 2)}\n`)
  } else {
    const width = Math.max(0, ...rows.map(row => row.name.length))
    for (const row of rows) {
      const state = row.state === 'ready' ? styles.green(row.state.padEnd(10)) : styles.yellow(row.state.padEnd(10))
      const details = [row.metadata?.primaryLanguage, flagsOf(row.metadata), row.metadata && `synced ${row.metadata.syncedAt.slice(0, 10)}`]
      io.write(`${printable(row.name.padEnd(width))}  ${state}  ${styles.dim(details.filter(Boolean).join('  '))}`.trimEnd() + '\n')
    }
  }
  return invalid.length > 0 ? EXIT.none : EXIT.ok
}

/** `bundle-grep list`. */
export const listCommand: Command = { name: 'list', summary: 'show archived repositories', usage: USAGE, run }
