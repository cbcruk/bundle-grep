/**
 * The `sync` command: archives repositories from GitHub or any git URL.
 *
 * @module
 */

import { listGithubRepos, syncRepos, targetFromUrl, viewGithubRepo, type SyncTarget } from '@bundle-grep/core'
import { Result } from 'better-result'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseCommandArgs, wholeNumber } from '../args'
import type { Command, Io } from '../cli.types'
import { EXIT } from '../exit-codes'
import { expandHome } from '../expand-home'
import { stylesFor } from '../format/ansi'
import { formatFailure, formatNotice, formatStatus } from '../format/status-line'
import { layoutFor } from '../layout'
import { batchSshEnv, hasSshCommandConfig } from '../ssh-env'
import type { Resolved, TargetError } from './commands.types'

const USAGE = `Usage: bundle-grep sync <source>... [options]

Archives repositories as bundles and refreshes their search caches.

Sources:
  <owner>          every repository of a GitHub user or organisation, via gh
  <owner>/<name>   one GitHub repository, via gh
  <url>            any git URL, such as https://… or git@host:owner/name
  <path>           a local repository; prefix a relative one with ./ if it
                   could be read as <owner>/<name>

Options:
  --limit <n>      fail for an owner with more repositories than this (default 1000)
  --root <dir>     where the archive lives (default $BUNDLE_GREP_ROOT or ~/.bundle-grep)
  --json           print one JSON object per source or repository
  -h, --help       show this help
`

const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\/|^[^/\s]+:/i
const GITHUB = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)/i

/**
 * Turns one source argument into sync targets.
 *
 * A GitHub URL is looked up with `gh` so that `is:fork` and `is:archived`
 * work, but keeps the URL as given, so an SSH URL is still fetched over SSH;
 * when `gh` cannot help, the repository is synced anyway with a warning.
 * Local paths are made absolute, as git runs them from the cache directory.
 */
export async function targetsFor(source: string, io: Io, limit: number): Promise<Result<Resolved, TargetError>> {
  const options = { gh: io.gh, signal: io.signal }
  const one = (target: SyncTarget, warning?: string): Resolved => ({ targets: [target], ...(warning ? { warning } : {}) })

  if (URL_LIKE.test(source)) {
    const parsed = targetFromUrl(source)
    if (parsed.isErr() || !GITHUB.test(parsed.value.url)) return parsed.map(target => one(target))
    const target = parsed.value
    const viewed = await viewGithubRepo(`${target.owner}/${target.name}`, options)
    if (viewed.isOk()) return Result.ok(one({ ...viewed.value, url: target.url }))
    return Result.ok(one(target, `could not look ${target.owner}/${target.name} up with gh, so whether it is a fork or archived is unknown: ${viewed.error.message}`))
  }
  if (/^[./~]/.test(source) || existsSync(source)) {
    return targetFromUrl(resolve(expandHome(source))).map(target => one(target))
  }
  if (source.includes('/')) return (await viewGithubRepo(source, options)).map(target => one(target))
  return (await listGithubRepos(source, { ...options, limit })).map(targets => ({ targets }))
}

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
    const found = await targetsFor(source, io, limit)
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
