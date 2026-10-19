/**
 * Types shared by the `bundle-grep` commands.
 *
 * @module
 */

/** Where a command reads its environment from and writes its output to. */
export interface Io {
  /** Writes to standard output. */
  write(text: string): void
  /** Writes to standard error. */
  error(text: string): void
  /** The environment; `sync` may add `GIT_SSH_COMMAND` to it, so pass `process.env` to affect git. */
  env: Record<string, string | undefined>
  /** Whether to color output with ANSI escapes. */
  color: boolean
  /** Whether a person is at the terminal to answer prompts. */
  interactive: boolean
  /** Stops the command, killing any git still running. */
  signal?: AbortSignal
  /** The GitHub CLI to run; `gh` on the `PATH` by default. */
  gh?: string
}

/** One `bundle-grep` subcommand. */
export interface Command {
  /** The name typed after `bundle-grep`. */
  name: string
  /** A one-line description for the command list. */
  summary: string
  /** The full help text. */
  usage: string
  /**
   * Runs the command with the arguments after its name.
   *
   * @returns The process exit code.
   */
  run(args: string[], io: Io): Promise<number>
}
