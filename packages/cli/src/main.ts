#!/usr/bin/env bun

import { run } from './run'

const controller = new AbortController()
process.once('SIGINT', () => controller.abort())

const env = process.env

function colorFor(stream: { isTTY?: boolean }): boolean {
  if (env.NO_COLOR) return false
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== '0'
  return env.TERM !== 'dumb' && Boolean(stream.isTTY)
}

const code = await run(process.argv.slice(2), {
  write: text => void process.stdout.write(text),
  error: text => void process.stderr.write(text),
  env,
  color: colorFor(process.stdout),
  errorColor: colorFor(process.stderr),
  interactive: Boolean(process.stdin.isTTY),
  signal: controller.signal,
})

process.exitCode = controller.signal.aborted ? 130 : code
