/**
 * The `restore` command: rebuilds search caches from archived bundles.
 *
 * @module
 */

import { listArchive, restoreRepos, type ArchiveEntry } from '@bundle-grep/core'

import { parseCommandArgs } from '../args'
import type { Command, Io } from '../cli.types'
import { EXIT } from '../exit-codes'
import { stylesFor } from '../format/ansi'
import { formatFailure, formatNotice, formatStatus } from '../format/status-line'
import { layoutFor } from '../layout'

const USAGE = `Usage: bundle-grep restore [<owner>|<owner>/<name>]... [options]

Rebuilds search caches from the archived bundles, all of them by default.

Options:
  --root <dir>     where the archive lives (default $BUNDLE_GREP_ROOT or ~/.bundle-grep)
  --json           print one JSON object per repository
  -h, --help       show this help
`

/**
 * Says whether an archive entry is one of the repositories asked for.
 *
 * @param wanted Owners and `owner/name`s, compared case-insensitively; an
 * empty list asks for everything.
 */
export function isWanted(entry: ArchiveEntry, wanted: readonly string[]): boolean {
  if (wanted.length === 0) return true
  const owner = entry.owner.toLowerCase()
  const full = `${owner}/${entry.name.toLowerCase()}`
  return wanted.some(item => [owner, full].includes(item.toLowerCase()))
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

  const layout = layoutFor(values.root, io.env)
  const listed = await listArchive(layout)
  if (listed.isErr()) {
    io.error(formatNotice('error', listed.error.message, errors))
    return EXIT.error
  }
  const entries = listed.value.filter(entry => isWanted(entry, positionals))
  const unmatched = positionals.filter(item => !listed.value.some(entry => isWanted(entry, [item])))
  for (const item of unmatched) io.error(formatNotice('warning', `nothing archived matches ${item}`, errors))
  if (listed.value.length === 0) io.error(formatNotice('warning', 'nothing is archived yet; run `bundle-grep sync <owner>` first', errors))

  let failed = unmatched.length > 0
  for await (const event of restoreRepos(entries, { ...layout, signal: io.signal })) {
    const repo = `${event.entry.owner}/${event.entry.name}`
    if (event.type === 'failed') {
      failed = true
      if (values.json) io.write(`${JSON.stringify({ type: 'failed', repo, error: event.error.message })}\n`)
      else io.error(formatFailure(repo, event.error.message, errors))
    } else if (values.json) {
      io.write(`${JSON.stringify({ type: 'restored', repo, status: event.outcome.status })}\n`)
    } else {
      io.write(formatStatus(event.outcome.status, repo, styles))
    }
  }
  if (io.signal?.aborted) return EXIT.error
  return failed ? EXIT.none : EXIT.ok
}

/** `bundle-grep restore`. */
export const restoreCommand: Command = { name: 'restore', summary: 'rebuild search caches from bundles', usage: USAGE, run }
