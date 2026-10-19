import { describe, expect, test } from 'bun:test'

import { findLanguage, languageNames, languageOf } from '../../src/plan/languages'

describe('languageOf', () => {
  test.each([
    ['README.md', 'Markdown'],
    ['src/a.ts', 'TypeScript'],
    ['types/a.d.ts', 'TypeScript'],
    ['x/Foo.m', 'Objective-C'],
    ['lib.rs', 'Rust'],
    ['config.yml', 'YAML'],
    ['Dockerfile', 'Dockerfile'],
    ['a.H', 'C'],
    ['pnpm-lock.yaml', 'YAML'],
    ['setup.cfg', 'INI'],
    ['schema.sql', 'SQL'],
    ['main.for', 'Fortran'],
    ['App.tsx', 'TSX'],
    ['View.mm', 'Objective-C++'],
    ['Token.sol', 'Solidity'],
    ['main.f', 'Fortran'],
    ['app.properties', 'Java Properties'],
    ['player.gd', 'GDScript'],
    ['Component.vue', 'Vue'],
    ['Cargo.toml', 'TOML'],
    ['setup.ms', 'Roff'],
    ['thesis.cls', 'TeX'],
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

describe('pinned extensions', () => {
  test('name languages that exist and claim the extension', () => {
    const pinned = {
      '.cfg': 'INI',
      '.cls': 'TeX',
      '.d': 'D',
      '.f': 'Fortran',
      '.for': 'Fortran',
      '.fs': 'F#',
      '.h': 'C',
      '.ms': 'Roff',
      '.sql': 'SQL',
      '.v': 'Verilog',
      '.yaml': 'YAML',
    }
    for (const [extension, language] of Object.entries(pinned)) {
      expect(findLanguage(language)?.extensions.map(e => e.toLowerCase())).toContain(extension)
    }
  })
})

describe('languageNames', () => {
  test('lists popular languages first, then the rest alphabetically, each once', () => {
    const names = languageNames()
    expect(names.slice(0, 3)).toEqual(['C', 'C#', 'C++'])
    expect(names.indexOf('TypeScript')).toBeLessThan(names.indexOf('Ada'))
    expect(new Set(names).size).toBe(names.length)
    const rest = names.slice(names.indexOf('TypeScript') + 1)
    expect(rest).toEqual(rest.toSorted((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
    expect(names.every(name => findLanguage(name)?.name === name)).toBe(true)
  })
})
