/**
 * Dispatches `bundle-grep` arguments to a command.
 *
 * @module
 */

import type { Command, Io } from './cli.types'
import { listCommand } from './commands/list-command'
import { restoreCommand } from './commands/restore-command'
import { searchCommand } from './commands/search-command'
import { syncCommand } from './commands/sync-command'
import { EXIT } from './exit-codes'

const COMMANDS: readonly Command[] = [syncCommand, restoreCommand, searchCommand, listCommand]

const USAGE = `Usage: bundle-grep <command> [options]

Commands:
${COMMANDS.map(command => `  ${command.name.padEnd(9)} ${command.summary}`).join('\n')}

Run \`bundle-grep <command> --help\` for a command's options.
`

/**
 * Runs `bundle-grep` with its arguments, without touching the process.
 *
 * @param argv The arguments after the program name.
 * @returns The exit code: `0` on success, `1` when a search found nothing or
 * some repositories failed, `2` on bad arguments or an error.
 *
 * @example Running a search from code
 * ```ts
 * import { run } from "./run";
 *
 * const code = await run(["search", "useState"], {
 *   write: text => process.stdout.write(text),
 *   error: text => process.stderr.write(text),
 *   env: process.env,
 *   color: false,
 *   interactive: false,
 * });
 * ```
 */
export async function run(argv: string[], io: Io): Promise<number> {
  const [name, ...args] = argv
  if (name === '-h' || name === '--help' || name === 'help') {
    io.write(USAGE)
    return EXIT.ok
  }
  const command = COMMANDS.find(candidate => candidate.name === name)
  if (!command) {
    io.error(name === undefined ? USAGE : `Unknown command "${name}"\n\n${USAGE}`)
    return EXIT.error
  }
  return command.run(args, io)
}
