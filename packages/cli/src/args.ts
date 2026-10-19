/**
 * Parses command arguments into values, as failures rather than exceptions.
 *
 * @module
 */

import { Result } from 'better-result'
import { parseArgs, type ParseArgsConfig } from 'node:util'

import { UsageError } from './cli.errors'

/** Options every command accepts. */
export const COMMON_OPTIONS = {
  root: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const satisfies ParseArgsConfig['options']

type Options = NonNullable<ParseArgsConfig['options']>

/** What {@linkcode parseCommandArgs} returns. */
export type ParsedArgs<O extends Options> = ReturnType<
  typeof parseArgs<{ options: O & typeof COMMON_OPTIONS; allowPositionals: true; strict: true }>
>

/**
 * Parses a command's arguments, accepting {@linkcode COMMON_OPTIONS} besides its own.
 *
 * @returns The values and positionals, or a {@linkcode UsageError} for an
 * unknown option or a missing option value.
 */
export function parseCommandArgs<O extends Options>(args: string[], options: O): Result<ParsedArgs<O>, UsageError> {
  return Result.try({
    try: () => parseArgs({ args, options: { ...options, ...COMMON_OPTIONS }, allowPositionals: true, strict: true }),
    catch: cause => new UsageError({ message: cause instanceof Error ? cause.message : String(cause) }),
  })
}

/**
 * Reads a whole number option.
 *
 * @returns The number, `fallback` when the option was not given, or a
 * {@linkcode UsageError} when it is not a whole number of at least `min`.
 */
export function wholeNumber(name: string, value: string | undefined, fallback: number, min = 0): Result<number, UsageError> {
  if (value === undefined) return Result.ok(fallback)
  const number = Number(value)
  if (/^\d+$/.test(value) && number >= min) return Result.ok(number)
  return Result.err(new UsageError({ message: `--${name} must be a whole number of at least ${min}, not "${value}"` }))
}
