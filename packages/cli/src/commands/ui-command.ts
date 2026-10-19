/**
 * The `ui` command: opens the desktop search window.
 *
 * @module
 */

import { dirname } from 'node:path'

import { parseCommandArgs } from '../args'
import type { Command, Io } from '../cli.types'
import { EXIT } from '../exit-codes'
import { stylesFor } from '../format/ansi'
import { formatNotice } from '../format/status-line'
import { layoutFor } from '../layout'
import { batchSshEnv, hasSshCommandConfig } from '../ssh-env'

const USAGE = `Usage: bundle-grep ui [options]

Opens the search window in a Chrome app window, served from 127.0.0.1 only.
Needs a local Chrome, Chromium, Edge or Brave; set BARLO_CHROME_PATH to pick one.
Returns when the window closes.

Options:
  --dev-server <url>  load the UI from a dev server, such as http://localhost:5173
  --root <dir>        where the archive lives (default $BUNDLE_GREP_ROOT or ~/.bundle-grep)
  -h, --help          show this help
`

async function run(args: string[], io: Io): Promise<number> {
  const errors = stylesFor(io.errorColor)
  const parsed = parseCommandArgs(args, { 'dev-server': { type: 'string' } })
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
  const devServer = values['dev-server']
  if (devServer !== undefined && !URL.canParse(devServer)) {
    io.error(`--dev-server must be a URL, not "${devServer}"\n\n${USAGE}`)
    return EXIT.error
  }

  const { openApp } = await import('@bundle-grep/desktop')
  const layout = layoutFor(values.root, io.env)
  const opened = await openApp({
    layout,
    root: dirname(layout.archiveDir),
    gh: io.gh,
    syncEnv: batchSshEnv(io.env, false, hasSshCommandConfig()),
    devServer,
    signal: io.signal,
  })
  if (opened.isErr()) {
    io.error(formatNotice('error', opened.error.message, errors))
    return EXIT.error
  }
  const app = opened.value
  if (io.signal?.aborted) app.exit()
  if (!app.exited) {
    await new Promise<void>(resolve => {
      app.onExit(resolve)
      io.signal?.addEventListener('abort', () => app.exit(), { once: true })
    })
  }
  return EXIT.ok
}

/** `bundle-grep ui`. */
export const uiCommand: Command = { name: 'ui', summary: 'open the search window', usage: USAGE, run }
