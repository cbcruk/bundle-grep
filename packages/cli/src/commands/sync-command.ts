/**
 * The `sync` command: archives repositories from GitHub or any git URL.
 *
 * @module
 */

import { resolveSyncSource, syncRepos, type SyncTarget } from '@bundle-grep/core'

import { parseCommandArgs, wholeNumber } from '../args'
import type { Command, Io } from '../cli.types'
import { EXIT } from '../exit-codes'
import { stylesFor } from '../format/ansi'
import { formatFailure, formatNotice, formatStatus } from '../format/status-line'
import { layoutFor } from '../layout'
import { batchSshEnv, hasSshCommandConfig } from '../ssh-env'

const USAGE = `Usage: bundle-grep sync <source>... [options]

Archives repositories as bundles and refreshes their search caches.

Sources:
  <owner>          every repository of a GitHub user or organisation, via gh
  <owner>/<name>   one GitHub repository, via gh
  <url>            any git URL, such as https://… or git@host:owner/name
  <path>           a local repository, starting with /, ./, ../ or ~/

Options:
  --limit <n>      fail for an owner with more repositories than this (default 1000)
  --root <dir>     where the archive lives (default $BUNDLE_GREP_ROOT or ~/.bundle-grep)
  --json           print one JSON object per source or repository
  -h, --help       show this help
`

async function run(args: string[], io: Io): Promise<number> {
  const styles = stylesFor(io.color)
  const errors = stylesFor(io.errorColor)
  const parsed = parseCommandArgs(args, { limit: { type: 'string' } }).andThen(({ values, positionals }) =>
    wholeNumber('limit', values.limit, 1000, 1).map(limit => ({ values, positionals, limit })),
  )
  if (parsed.isErr()) {
    io.error(`${parsed.error.message}\n\n${USAGE}`)
    return EXIT.error
  }
  const { values, positionals, limit } = parsed.value
  if (values.help) {
    io.write(USAGE)
    return EXIT.ok
  }
  if (positionals.length === 0) {
    io.error(USAGE)
    return EXIT.error
  }

  let failed = false
  const targets = new Map<string, SyncTarget>()
  for (const source of positionals) {
    const found = await resolveSyncSource(source, { gh: io.gh, signal: io.signal, limit })
    if (found.isErr()) {
      failed = true
      if (values.json) io.write(`${JSON.stringify({ type: 'failed', source, error: found.error.message })}\n`)
      else io.error(formatFailure(source, found.error.message, errors))
      continue
    }
    if (found.value.warning) io.error(formatNotice('warning', found.value.warning, errors))
    for (const target of found.value.targets) {
      const key = `${target.owner}/${target.name}`.toLowerCase()
      if (!targets.has(key)) targets.set(key, target)
    }
  }

  const env = batchSshEnv(io.env, io.interactive, !io.interactive && hasSshCommandConfig())
  const layout = layoutFor(values.root, io.env)
  for await (const event of syncRepos(targets.values(), { ...layout, env, signal: io.signal })) {
    const repo = `${event.target.owner}/${event.target.name}`
    if (event.type === 'failed') {
      failed = true
      if (values.json) io.write(`${JSON.stringify({ type: 'failed', repo, error: event.error.message })}\n`)
      else io.error(formatFailure(repo, event.error.message, errors))
    } else if (values.json) {
      io.write(`${JSON.stringify({ type: 'synced', repo, status: event.outcome.status })}\n`)
    } else {
      io.write(formatStatus(event.outcome.status, repo, styles))
    }
  }
  if (io.signal?.aborted) return EXIT.error
  return failed ? EXIT.none : EXIT.ok
}

/** `bundle-grep sync`. */
export const syncCommand: Command = { name: 'sync', summary: 'archive repositories from GitHub or a git URL', usage: USAGE, run }
