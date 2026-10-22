import { expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { delimiter, dirname } from 'node:path'

// On macOS `/usr/bin/git` is an xcrun shim that resolves Xcode on every call,
// which tripled the time of fixture tests that run git hundreds of times.
if (process.platform === 'darwin') {
  const found = spawnSync('xcrun', ['--find', 'git'], { encoding: 'utf8' })
  const dir = found.status === 0 ? dirname(found.stdout.trim()) : undefined
  if (dir && !process.env.PATH?.startsWith(`${dir}${delimiter}`)) process.env.PATH = `${dir}${delimiter}${process.env.PATH ?? ''}`
}

interface StringMatchers<R> {
  /** Passes when the received string starts with `prefix`. */
  toStartWith: (prefix: string) => R
  /** Passes when the received string ends with `suffix`. */
  toEndWith: (suffix: string) => R
}

interface MatcherResult {
  pass: boolean
  message: () => string
}

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> extends StringMatchers<R> {}
}

expect.extend({
  toStartWith(received: unknown, prefix: string): MatcherResult {
    const pass = typeof received === 'string' && received.startsWith(prefix)
    return { pass, message: () => `expected ${this.utils.printReceived(received)} ${pass ? 'not ' : ''}to start with ${this.utils.printExpected(prefix)}` }
  },
  toEndWith(received: unknown, suffix: string): MatcherResult {
    const pass = typeof received === 'string' && received.endsWith(suffix)
    return { pass, message: () => `expected ${this.utils.printReceived(received)} ${pass ? 'not ' : ''}to end with ${this.utils.printExpected(suffix)}` }
  },
})
