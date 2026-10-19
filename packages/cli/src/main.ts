#!/usr/bin/env bun

import { run } from './run'

const controller = new AbortController()
process.once('SIGINT', () => controller.abort())

const env = process.env
const color = env.NO_COLOR ? false : env.FORCE_COLOR && env.FORCE_COLOR !== '0' ? true : Boolean(process.stdout.isTTY)

process.exitCode = await run(process.argv.slice(2), {
  write: text => void process.stdout.write(text),
  error: text => void process.stderr.write(text),
  env,
  color,
  interactive: Boolean(process.stdin.isTTY),
  signal: controller.signal,
})
