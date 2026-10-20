/**
 * The `search` command: runs a GitHub code search query over the archive.
 *
 * @module
 */

import {
  compileQuery,
  loadArchivedRepos,
  parseQuery,
  QueryCompileError,
  repoHolds,
  search,
  symbolLanguages,
  validateRegexes,
} from '@bundle-grep/core'

import { parseCommandArgs, wholeNumber } from '../args'
import type { Command, Io } from '../cli.types'
import { EXIT } from '../exit-codes'
import { stylesFor } from '../format/ansi'
import { formatQueryError } from '../format/query-error'
import { formatFile, formatRepoHeading, formatSummary } from '../format/search-output'
import { formatNotice } from '../format/status-line'
import { layoutFor } from '../layout'

const USAGE = `Usage: bundle-grep search <query> [options]

Searches the archived repositories with GitHub code search syntax, such as
  bundle-grep search 'useState language:typescript -is:fork'

Words of the query may be given as separate arguments; they are joined with
spaces, and negated words such as -is:fork need no quoting. Put -- before a
word that starts with --. Results print as path:line:column:text, grouped by repository.

Options:
  --limit <n>        most files to show (default 100)
  -C, --context <n>  lines of context around each match (default 0)
  --root <dir>       where the archive lives (default $BUNDLE_GREP_ROOT or ~/.bundle-grep)
  --json             print one JSON object per event
  -h, --help         show this help

Exits 0 when something matched, 1 when nothing did, and 2 on an error.
`

async function run(args: string[], io: Io): Promise<number> {
  const styles = stylesFor(io.color)
  const errors = stylesFor(io.errorColor)
  const parsed = parseCommandArgs(args, { limit: { type: 'string' }, context: { type: 'string', short: 'C' } }, true).andThen(
    ({ values, positionals }) =>
      wholeNumber('limit', values.limit, 100).andThen(limit =>
        wholeNumber('context', values.context, 0).map(context => ({ values, positionals, limit, context })),
      ),
  )
  if (parsed.isErr()) {
    io.error(`${parsed.error.message}\n\n${USAGE}`)
    return EXIT.error
  }
  const { values, positionals, limit, context } = parsed.value
  if (values.help) {
    io.write(USAGE)
    return EXIT.ok
  }
  if (positionals.length === 0) {
    io.error(USAGE)
    return EXIT.error
  }

  const query = positionals.join(' ')
  const compiled = parseQuery(query).andThen(tree => compileQuery(tree).map(plan => ({ tree, plan })))
  if (compiled.isErr()) {
    io.error(formatQueryError(query, compiled.error, errors))
    return EXIT.error
  }
  const { tree, plan } = compiled.value
  const checked = await validateRegexes(tree, { signal: io.signal })
  if (checked.isErr()) {
    if (io.signal?.aborted) return EXIT.error
    const { error } = checked
    const message = error instanceof QueryCompileError ? formatQueryError(query, error, errors) : formatNotice('error', error.message, errors)
    io.error(message)
    return EXIT.error
  }

  const loaded = await loadArchivedRepos(layoutFor(values.root, io.env))
  if (loaded.isErr()) {
    io.error(formatNotice('error', loaded.error.message, errors))
    return EXIT.error
  }
  const { repos, unrestored, invalid } = loaded.value
  for (const error of invalid) io.error(formatNotice('warning', error.message, errors))
  if (unrestored.length > 0) {
    const count = unrestored.length === 1 ? '1 repository has' : `${unrestored.length} repositories have`
    io.error(formatNotice('warning', `${count} no search cache; run \`bundle-grep restore\` to search them`, errors))
  }
  if (repos.length === 0 && unrestored.length === 0) {
    io.error(formatNotice('error', 'nothing is archived yet; run `bundle-grep sync <owner>` first', errors))
    return EXIT.error
  }

  let failures = 0
  let shown = 0
  let matched = false
  let current: string | undefined
  for await (const event of search({ plan, repos, holds: repoHolds, limit, context, signal: io.signal })) {
    if (event.type === 'repo-error') {
      failures++
      if (values.json) io.write(`${JSON.stringify({ type: 'repo-error', repo: event.repo, error: event.error.message })}\n`)
      else io.error(formatNotice('error', `${event.repo}: ${event.error.message}`, errors))
      continue
    }
    if (values.json) io.write(`${JSON.stringify(event)}\n`)
    if (event.type === 'file') {
      shown++
      if (values.json) continue
      if (event.repo !== current) io.write(formatRepoHeading(event.repo, current === undefined, styles))
      current = event.repo
      io.write(formatFile(event, styles, context > 0))
    } else {
      matched = event.totalFiles > 0
      if (values.json) continue
      io.error(`${errors.dim(formatSummary(event, shown))}\n`)
      if (!matched && plan.symbols.length > 0) {
        io.error(`${errors.dim(`symbol: finds definitions in ${symbolLanguages().join(', ')} files only`)}\n`)
      }
    }
  }
  if (failures > 0 || io.signal?.aborted) return EXIT.error
  return matched ? EXIT.ok : EXIT.none
}

/** `bundle-grep search`. */
export const searchCommand: Command = { name: 'search', summary: 'search the archive with GitHub code search syntax', usage: USAGE, run }
