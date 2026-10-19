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
  /** The environment, read for `BUNDLE_GREP_ROOT` and ssh settings; git itself sees the process's own. */
  env: Record<string, string | undefined>
  /** Whether to color standard output with ANSI escapes. */
  color: boolean
  /** Whether to color standard error with ANSI escapes. */
  errorColor: boolean
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
