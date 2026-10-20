import { expect } from 'vitest'

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
