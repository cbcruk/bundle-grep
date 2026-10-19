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
 * Moves arguments that start with a single `-` but are not exactly a known
 * short option, such as `-h` or `-C 2` and `-C2`, behind a `--`, so they reach
 * the command as positionals.
 */
function looseArgs(args: readonly string[], options: Options): string[] {
  const takesValue = (name: string | undefined): boolean =>
    Object.entries(options).some(([long, option]) => (long === name || option.short === name) && option.type === 'string')
  const flags: string[] = []
  const positionals: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--') {
      positionals.push(...args.slice(i + 1))
      break
    }
    const long = arg.startsWith('--') ? arg.slice(2) : undefined
    const short = !long && arg.startsWith('-') ? arg[1] : undefined
    const known = short !== undefined && Object.values(options).some(option => option.short === short)
    if (long !== undefined) {
      flags.push(arg)
      if (!long.includes('=') && takesValue(long) && i + 1 < args.length) flags.push(args[++i]!)
    } else if (known && arg.length === 2) {
      flags.push(arg)
      if (takesValue(short) && i + 1 < args.length) flags.push(args[++i]!)
    } else if (known && takesValue(short) && /^\d+$/.test(arg.slice(2))) {
      flags.push(arg)
    } else {
      positionals.push(arg)
    }
  }
  return [...flags, '--', ...positionals]
}

/**
 * Parses a command's arguments, accepting {@linkcode COMMON_OPTIONS} besides its own.
 *
 * @param loose Treat a single-dash word that names no short option, such as
 * a search's `-is:fork`, as a positional instead of an unknown option.
 * Unknown `--` options are still errors.
 * @returns The values and positionals, or a {@linkcode UsageError} for an
 * unknown option or a missing option value.
 */
export function parseCommandArgs<O extends Options>(
  args: string[],
  options: O,
  loose = false,
): Result<ParsedArgs<O>, UsageError> {
  const all = { ...options, ...COMMON_OPTIONS }
  return Result.try({
    try: () => parseArgs({ args: loose ? looseArgs(args, all) : args, options: all, allowPositionals: true, strict: true }),
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
