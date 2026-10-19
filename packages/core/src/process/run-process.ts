/**
 * Runs a child process and collects its output.
 *
 * @module
 */

import { Result } from 'better-result'
import { spawn } from 'node:child_process'

import type { ProcessFailure, ProcessOutput, RunProcessOptions } from './process.types'

function withEnv(overrides: Record<string, string | undefined>): Record<string, string> {
  const merged = { ...process.env, ...overrides }
  return Object.fromEntries(
    Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
}

/**
 * Runs a command with the given arguments and waits for it to exit.
 *
 * @returns The output, or a {@linkcode ProcessFailure} when the command cannot
 * start or exits with a status outside `0` and `allowExitCodes`.
 */
export function runProcess(
  command: string,
  args: readonly string[],
  options: RunProcessOptions,
): Promise<Result<ProcessOutput, ProcessFailure>> {
  return new Promise(resolve => {
    // spawn throws synchronously for some failures, such as E2BIG.
    const spawned = Result.try(() =>
      spawn(command, args, {
        cwd: options.cwd,
        env: options.env ? withEnv(options.env) : process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: options.signal,
      }),
    )
    if (spawned.isErr()) {
      const cause = spawned.error.cause
      const reason = cause instanceof Error ? cause.message : String(cause)
      resolve(Result.err({ exitCode: null, stderr: '', started: false, reason }))
      return
    }
    const child = spawned.value
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    child.on('error', cause => {
      resolve(Result.err({ exitCode: null, stderr: '', started: false, reason: cause.message }))
    })

    child.on('close', exitCode => {
      const errorText = Buffer.concat(stderr).toString('utf8').trim()
      if (exitCode === 0 || (exitCode !== null && options.allowExitCodes?.includes(exitCode))) {
        resolve(Result.ok({ stdout: Buffer.concat(stdout), exitCode }))
        return
      }
      resolve(
        Result.err({
          exitCode,
          stderr: errorText,
          started: true,
          reason: `failed${exitCode === null ? '' : ` with exit code ${exitCode}`}: ${errorText}`,
        }),
      )
    })
  })
}
