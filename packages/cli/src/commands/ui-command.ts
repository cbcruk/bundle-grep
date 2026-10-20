/**
 * The `ui` command: serves the search page and opens it in the browser.
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

Serves the search page from 127.0.0.1 only, prints its URL and opens it in the
default browser. The URL carries a code that works once, for the first page
that opens it. Runs until Ctrl-C.

Options:
  --port <n>          listen on this port (default any free one)
  --no-open           print the URL without opening a browser
  --dev-server <url>  load the UI from a dev server, such as http://localhost:5173
  --root <dir>        where the archive lives (default $BUNDLE_GREP_ROOT or ~/.bundle-grep)
  -h, --help          show this help
`

function portOf(text: string): number | null {
  if (!/^\d+$/.test(text)) return null
  const port = Number(text)
  return port >= 1 && port <= 65535 ? port : null
}

async function run(args: string[], io: Io): Promise<number> {
  const errors = stylesFor(io.errorColor)
  const parsed = parseCommandArgs(args, {
    'dev-server': { type: 'string' },
    port: { type: 'string' },
    'no-open': { type: 'boolean' },
  })
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

  const port = values.port === undefined ? undefined : portOf(values.port)
  if (port === null) {
    io.error(`--port must be a whole number from 1 to 65535, not "${values.port}"\n\n${USAGE}`)
    return EXIT.error
  }

  const { openBrowser, serveApp } = await import('@bundle-grep/desktop')
  const layout = layoutFor(values.root, io.env)
  const served = await serveApp({
    layout,
    root: dirname(layout.archiveDir),
    gh: io.gh,
    syncEnv: batchSshEnv(io.env, false, hasSshCommandConfig()),
    devServer,
    port,
    signal: io.signal,
  })
  if (served.isErr()) {
    io.error(formatNotice('error', served.error.message, errors))
    return EXIT.error
  }
  const server = served.value
  io.write(`bundle-grep is serving ${server.url}\nPress Ctrl-C to stop.\n`)
  if (!values['no-open'] && !(await openBrowser(server.url)) && !io.signal?.aborted) {
    io.error(formatNotice('warning', 'Could not open a browser; open the URL above', errors))
  }
  if (!io.signal?.aborted) {
    await new Promise<void>(resolve => io.signal?.addEventListener('abort', () => resolve(), { once: true }))
  }
  await server.stop()
  return EXIT.ok
}

/** `bundle-grep ui`. */
export const uiCommand: Command = { name: 'ui', summary: 'serve the search page in the browser', usage: USAGE, run }
