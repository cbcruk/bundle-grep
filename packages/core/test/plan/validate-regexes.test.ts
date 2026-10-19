import { describe, expect, test } from 'bun:test'

import { GitError } from '../../src/git/git.errors'
import { QueryCompileError } from '../../src/plan/plan.errors'
import { validateRegexes } from '../../src/plan/validate-regexes'
import { parseQuery } from '../../src/query/parse-query'

async function check(query: string): Promise<unknown> {
  const result = await validateRegexes(parseQuery(query).unwrap())
  if (result.isOk()) return 'ok'
  const { error } = result
  return error instanceof QueryCompileError ? { message: error.message, ...error.span } : error
}

describe('validateRegexes', () => {
  test('queries whose regexes compile', async () => {
    expect(await check('foo')).toBe('ok')
    expect(await check('/use[A-Z]\\w+/ content:/\\Afoo/ path:/^src/')).toBe('ok')
    expect(await check('/(?-i)Foo/')).toBe('ok')
  })

  test('an invalid regex term points at itself', async () => {
    expect(await check('foo /[a-z/')).toEqual({
      message: 'Invalid regular expression: missing terminating ] for character class',
      offset: 4,
      length: 6,
    })
  })

  test('an invalid content: regex covers the qualifier', async () => {
    expect(await check('content:/(?<x/')).toMatchObject({ offset: 0, length: 14 })
  })

  test('regexes under NOT and OR are checked', async () => {
    expect(await check('a OR NOT /(/')).toMatchObject({ offset: 9, length: 3 })
    expect(await check('-content:/(/')).toMatchObject({ offset: 1, length: 11 })
  })

  test('the first invalid regex in query order is reported', async () => {
    expect(await check('/ok/ /[/ /(/')).toMatchObject({ offset: 5, length: 3 })
  })

  test('a repeated regex is reported where it first appears', async () => {
    expect(await check('/[/ OR (x /[/)')).toMatchObject({ offset: 0, length: 3 })
  })

  test('path: regexes are left to compileQuery', async () => {
    expect(await check('path:/a[]/')).toBe('ok')
    expect(await check('/a[]/')).toMatchObject({ offset: 0, length: 5 })
  })

  test('an aborted signal is a GitError, not a query error', async () => {
    const result = await validateRegexes(parseQuery('/[/').unwrap(), { signal: AbortSignal.abort() })
    expect(result.isErr() && result.error).toBeInstanceOf(GitError)
  })
})
