/**
 * Types for running child processes.
 *
 * @module
 */

/** Options for {@linkcode runProcess}. */
export interface RunProcessOptions {
  /** The directory to run in. */
  cwd?: string
  /** Variables to set on top of the current environment; `undefined` removes one. */
  env?: Record<string, string | undefined>
  /** Exit statuses that count as success, besides `0`. */
  allowExitCodes?: readonly number[]
  /** Kills the process when aborted; the run then fails. */
  signal?: AbortSignal
  /** Written to the process's stdin, which is then closed; without it, stdin is closed at once. */
  input?: string
  /**
   * Receives stdout as it arrives, instead of collecting it into
   * {@linkcode ProcessOutput.stdout}, which is then empty.
   */
  onStdout?: (chunk: Buffer) => void
}

/** What a process that exited with an accepted status produced. */
export interface ProcessOutput {
  /** Everything the process wrote to stdout. */
  stdout: Buffer
  /** The exit status, `0` or one of {@linkcode RunProcessOptions.allowExitCodes}. */
  exitCode: number
}

/** Why a process run failed. */
export interface ProcessFailure {
  /** The exit status, or `null` when the process never started or was killed by a signal. */
  exitCode: number | null
  /** What the process wrote to stderr, trimmed. */
  stderr: string
  /** Whether the process started; when not, {@linkcode ProcessFailure.reason} says why. */
  started: boolean
  /** Human-readable summary, without the command's name, such as `failed with exit code 1: …`. */
  reason: string
}
