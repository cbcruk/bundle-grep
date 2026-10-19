import { describe, expect, test } from 'bun:test'

import { findLanguage, languageOf } from '../../src/plan/languages'

describe('languageOf', () => {
  test.each([
    ['README.md', 'Markdown'],
    ['src/a.ts', 'TypeScript'],
    ['types/a.d.ts', 'TypeScript'],
    ['x/Foo.m', 'Objective-C'],
    ['lib.rs', 'Rust'],
    ['config.yml', 'YAML'],
    ['Dockerfile', 'Dockerfile'],
    ['a.H', 'C++'],
  ])('%s is %s', (path, language) => {
    expect(languageOf(path)).toBe(language)
  })

  test('an unknown file type', () => {
    expect(languageOf('a.zzqq')).toBeUndefined()
  })
})

describe('findLanguage', () => {
  test('by alias, ignoring case', () => {
    expect(findLanguage('TS')?.name).toBe('TypeScript')
  })
})
