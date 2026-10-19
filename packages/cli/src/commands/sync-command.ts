/**
 * The `sync` command: archives repositories from GitHub or any git URL.
 *
 * @module
 */

import {
  listGithubRepos,
  syncRepos,
  targetFromUrl,
  viewGithubRepo,
  type GhError,
  type InvalidRepoNameError,
  type SyncTarget,
} from '@bundle-grep/core'
import { Result } from 'better-result'

import { parseCommandArgs, wholeNumber } from '../args'
import type { Command, Io } from '../cli.types'
import { EXIT } from '../exit-codes'
import { stylesFor } from '../format/ansi'
import { layoutFor } from '../layout'

const USAGE = `Usage: bundle-grep sync <source>... [options]

Archives repositories as bundles and refreshes their search caches.

Sources:
  <owner>          every repository of a GitHub user or organisation, via gh
  <owner>/<name>   one GitHub repository, via gh
  <url>|<path>     any git URL, or a local path starting with /, . or ~

Options:
  --limit <n>      most repositories to list per owner (default 1000)
  --root <dir>     where the archive lives (default $BUNDLE_GREP_ROOT or ~/.bundle-grep)
  --json           print one JSON object per repository
  -h, --help       show this help
`

const LOCATION = /^(?:[a-z][a-z0-9+.-]*:\/\/|[^/@\s]+@[^/:\s]+:|[./~])/i
const GITHUB = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)/i

type TargetError = GhError | InvalidRepoNameError

/**
 * Turns one source argument into sync targets.
 *
 * A GitHub URL is looked up with `gh` so that `is:fork` and `is:archived`
 * work, but keeps the URL as given, so an SSH URL is still fetched over SSH.
 */
export async function targetsFor(source: string, io: Io, limit: number): Promise<Result<SyncTarget[], TargetError>> {
  const options = { gh: io.gh, signal: io.signal }
  if (LOCATION.test(source)) {
    const parsed = targetFromUrl(source)
    if (parsed.isErr() || !GITHUB.test(parsed.value.url)) return parsed.map(target => [target])
    const target = parsed.value
    const viewed = await viewGithubRepo(`${target.owner}/${target.name}`, options)
    return viewed.map(found => [{ ...found, url: target.url }])
  }
  if (source.includes('/')) return (await viewGithubRepo(source, options)).map(target => [target])
  return listGithubRepos(source, { ...options, limit })
}

async function run(args: string[], io: Io): Promise<number> {
  const styles = stylesFor(io.color)
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

  if (!io.interactive && io.env.GIT_SSH_COMMAND === undefined) io.env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'

  let failed = false
  const targets = new Map<string, SyncTarget>()
  for (const source of positionals) {
    const found = await targetsFor(source, io, limit)
    if (found.isErr()) {
      failed = true
      if (values.json) io.write(`${JSON.stringify({ type: 'failed', source, error: found.error.message })}\n`)
      else io.error(`${styles.red('failed')}    ${source}: ${found.error.message}\n`)
      continue
    }
    for (const target of found.value) targets.set(`${target.owner}/${target.name}`.toLowerCase(), target)
  }

  const layout = layoutFor(values.root, io.env)
  for await (const event of syncRepos(targets.values(), { ...layout, signal: io.signal })) {
    const repo = `${event.target.owner}/${event.target.name}`
    if (event.type === 'failed') {
      failed = true
      if (values.json) io.write(`${JSON.stringify({ type: 'failed', repo, error: event.error.message })}\n`)
      else io.error(`${styles.red('failed')}    ${repo}: ${event.error.message}\n`)
      continue
    }
    const { status } = event.outcome
    if (values.json) io.write(`${JSON.stringify({ type: 'synced', repo, status })}\n`)
    else io.write(`${status === 'unchanged' || status === 'empty' ? styles.dim(status.padEnd(9)) : styles.green(status.padEnd(9))} ${repo}\n`)
  }
  if (io.signal?.aborted) return EXIT.error
  return failed ? EXIT.none : EXIT.ok
}

/** `bundle-grep sync`. */
export const syncCommand: Command = { name: 'sync', summary: 'archive repositories from GitHub or a git URL', usage: USAGE, run }
