/**
 * Runs git as a child process and collects its output.
 *
 * @module
 */

import { Result } from 'better-result'
import { spawn } from 'node:child_process'

import { GitError } from './git.errors'
import type { GitOutput, RunGitOptions } from './git.types'

/**
 * Runs git with the given arguments and waits for it to exit.
 *
 * `color.ui` is forced off, since a user's `color.ui=always` would otherwise
 * put escape codes into output that is parsed. A command-specific setting such
 * as `color.grep` still wins over it, so callers parsing output also pass
 * `--no-color`.
 *
 * @returns The output, or a {@linkcode GitError} when git cannot start or
 * exits with a status outside `0` and `allowExitCodes`.
 */
export function runGit(args: readonly string[], options: RunGitOptions): Promise<Result<GitOutput, GitError>> {
  return new Promise(resolve => {
    const child = spawn('git', ['-c', 'color.ui=never', ...args], { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    child.on('error', cause => {
      resolve(
        Result.err(
          new GitError({ args, exitCode: null, stderr: '', message: `Could not run git: ${cause.message}` }),
        ),
      )
    })

    child.on('close', exitCode => {
      const errorText = Buffer.concat(stderr).toString('utf8').trim()
      if (exitCode === 0 || (exitCode !== null && options.allowExitCodes?.includes(exitCode))) {
        resolve(Result.ok({ stdout: Buffer.concat(stdout), exitCode }))
        return
      }
      resolve(
        Result.err(
          new GitError({
            args,
            exitCode,
            stderr: errorText,
            message: `git ${args[0] ?? ''} failed${exitCode === null ? '' : ` with exit code ${exitCode}`}: ${errorText}`,
          }),
        ),
      )
    })
  })
}

/** Splits NUL-terminated output, as produced by git's `-z`, into its entries. */
export function splitNul(output: Buffer): string[] {
  const text = output.toString('utf8')
  return text === '' ? [] : text.replace(/\0$/, '').split('\0')
}
