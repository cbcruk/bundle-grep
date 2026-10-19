import { describe, expect, test } from 'bun:test'

import { compileQuery } from '../../src/plan/compile-query'
import { grepArgs } from '../../src/plan/grep-args'
import { parseQuery } from '../../src/query/parse-query'

function plan(query: string): ReturnType<typeof compileQuery> {
  return compileQuery(parseQuery(query).unwrap())
}

/** The compiled expression, loosely typed so tests can compare it with literal shapes. */
function expr(query: string): unknown {
  return plan(query).unwrap().expr
}

function error(query: string): { message: string; offset: number; length: number } {
  const result = plan(query)
  if (result.isOk()) throw new Error(`expected "${query}" to fail`)
  return { message: result.error.message, ...result.error.span }
}

const fixed = (...patterns: string[]): unknown => ({ op: 'grep', engine: 'fixed', patterns, match: 'any' })

describe('terms', () => {
  test('a bare term matches contents or path', () => {
    expect(expr('useState')).toEqual({ op: 'or', children: [fixed('useState'), { op: 'path', regex: 'useState' }] })
  })

  test('regex metacharacters in a literal are escaped for the path test', () => {
    expect(expr('a.b(')).toEqual({ op: 'or', children: [fixed('a.b('), { op: 'path', regex: 'a\\.b\\(' }] })
  })

  test('a bare regex matches contents with PCRE or the path with the same source', () => {
    expect(expr('/use[A-Z]\\w+/')).toEqual({
      op: 'or',
      children: [
        { op: 'grep', engine: 'pcre', patterns: ['use[A-Z]\\w+'], match: 'any' },
        { op: 'path', regex: 'use[A-Z]\\w+' },
      ],
    })
  })

  test('a bare regex JavaScript cannot compile still searches contents', () => {
    expect(expr('/(?-i)True/')).toEqual({ op: 'grep', engine: 'pcre', patterns: ['(?-i)True'], match: 'any' })
  })

  test('content: searches only contents', () => {
    expect(expr('content:README')).toEqual(fixed('README'))
  })
})

describe('path:', () => {
  test.each([
    ['path:src', 'src'],
    ['path:"file?"', 'file\\?'],
    ['path:"*.ts"', '\\*\\.ts'],
    ['path:/src', '^src'],
    ['path:*.txt', '[^/]*\\.txt$'],
    ['path:*.a?c', '[^/]*\\.a[^/]c$'],
    ['path:src/*.js', 'src/[^/]*\\.js$'],
    ['path:/src/**/*.js', '^src/(?:.*/)?[^/]*\\.js$'],
    ['path:/src/**', '^src/.*$'],
    ['path:/^src\\//', '^src/'],
  ])('%s', (query, regex) => {
    expect(expr(query)).toEqual({ op: 'path', regex })
  })

  test('an invalid regex', () => {
    const failure = error('path:/a(/')
    expect(failure).toMatchObject({ offset: 0, length: 9 })
    expect(failure.message).toStartWith('Invalid regular expression for path: ')
  })
})

describe('language:', () => {
  test('by name, case-insensitively', () => {
    expect(expr('language:typescript')).toEqual({
      op: 'language',
      language: 'TypeScript',
      extensions: ['.ts', '.cts', '.mts'],
      filenames: [],
    })
  })

  test('by alias', () => {
    expect(expr('language:ts')).toMatchObject({ language: 'TypeScript' })
  })

  test('a name with spaces, quoted or hyphenated', () => {
    expect(expr('language:"Common Lisp"')).toMatchObject({ language: 'Common Lisp' })
    expect(expr('language:common-lisp')).toMatchObject({ language: 'Common Lisp' })
  })

  test('filenames are kept', () => {
    expect(expr('language:dockerfile')).toMatchObject({ filenames: ['Containerfile', 'Dockerfile'] })
  })

  test('an unknown language', () => {
    expect(error('foo language:klingon')).toEqual({ message: 'Unknown language "klingon"', offset: 4, length: 16 })
  })
})

describe('filters', () => {
  test.each(['repo:cbcruk/barlo', 'org:cbcruk', 'user:cbcruk', 'is:fork'])('%s stays for specialization', query => {
    const [key, value] = query.split(':')
    expect(expr(query)).toEqual({ op: 'filter', key, value })
  })

  test('repo qualifiers combine with OR', () => {
    expect(expr('repo:a/b OR repo:c/d')).toEqual({
      op: 'or',
      children: [
        { op: 'filter', key: 'repo', value: 'a/b' },
        { op: 'filter', key: 'repo', value: 'c/d' },
      ],
    })
  })
})

describe('boolean structure', () => {
  test('content patterns of one engine under AND share one --all-match grep', () => {
    expect(expr('content:a content:b content:/c/')).toEqual({
      op: 'and',
      children: [
        { op: 'grep', engine: 'fixed', patterns: ['a', 'b'], match: 'all' },
        { op: 'grep', engine: 'pcre', patterns: ['c'], match: 'any' },
      ],
    })
  })

  test('content patterns of one engine under OR share one grep', () => {
    expect(expr('content:a OR content:b')).toEqual(fixed('a', 'b'))
  })

  test('NOT complements', () => {
    expect(expr('content:a NOT path:test')).toEqual({
      op: 'and',
      children: [fixed('a'), { op: 'not', child: { op: 'path', regex: 'test' } }],
    })
  })

  test('double negation cancels', () => {
    expect(expr('NOT NOT content:a')).toEqual(fixed('a'))
  })
})

describe('highlight', () => {
  test('positive content patterns, without duplicates', () => {
    expect(plan('foo content:/ba+r/ NOT baz path:x foo').unwrap().highlight).toEqual([
      { kind: 'literal', value: 'foo', quoted: false },
      { kind: 'regex', source: 'ba+r' },
    ])
  })

  test('a doubly negated pattern counts as positive', () => {
    expect(plan('NOT (a NOT b)').unwrap().highlight).toEqual([{ kind: 'literal', value: 'b', quoted: false }])
  })
})

describe('grepArgs', () => {
  test('one fixed pattern', () => {
    expect(grepArgs({ op: 'grep', engine: 'fixed', patterns: ['-x'], match: 'any' })).toEqual(['-i', '-F', '-e', '-x'])
  })

  test('several PCRE patterns that must all match', () => {
    expect(grepArgs({ op: 'grep', engine: 'pcre', patterns: ['a', 'b'], match: 'all' })).toEqual([
      '-i',
      '-P',
      '--all-match',
      '-e',
      'a',
      '-e',
      'b',
    ])
  })
})
