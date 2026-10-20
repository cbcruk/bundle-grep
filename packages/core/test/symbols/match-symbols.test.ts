import { describe, expect, test } from 'bun:test'

import { compileQuery, parseQuery } from '../../src'
import { symbolMatcher } from '../../src/symbols/match-symbols'
import type { SymbolDefinition } from '../../src/symbols/symbols.types'

function matching(query: string, symbols: readonly SymbolDefinition[]): string[] {
  const plan = parseQuery(query).andThen(compileQuery).unwrap()
  return symbols.filter(symbolMatcher(plan.symbols)).map(symbol => symbol.qualified ?? symbol.name)
}

const at = { line: 1, column: 0 }
const SYMBOLS: SymbolDefinition[] = [
  { name: 'deleteRows', qualified: 'Maint.deleteRows', kind: 'method', ...at },
  { name: 'deleteRows', qualified: 'db::Maint::deleteRows', kind: 'method', ...at },
  { name: 'deleteRows', qualified: 'Other.deleteRows', kind: 'method', ...at },
  { name: 'deleteRows', kind: 'function', ...at },
  { name: 'to_string', qualified: 'String::to_string', kind: 'method', ...at },
  { name: 'Maint', kind: 'struct', ...at },
]

describe('symbolMatcher', () => {
  test('a bare name matches definitions by name, wherever they are', () => {
    expect(matching('symbol:deleteRows', SYMBOLS)).toEqual(['Maint.deleteRows', 'db::Maint::deleteRows', 'Other.deleteRows', 'deleteRows'])
    expect(matching('symbol:/^Maint/', SYMBOLS)).toEqual(['Maint'])
  })

  test('a qualified name matches the end of a qualified name, in either separator', () => {
    for (const query of ['symbol:Maint.deleteRows', 'symbol:maint::deleterows']) {
      expect(matching(query, SYMBOLS)).toEqual(['Maint.deleteRows', 'db::Maint::deleteRows'])
    }
    expect(matching('symbol:db::Maint::deleteRows', SYMBOLS)).toEqual(['db::Maint::deleteRows'])
    expect(matching('symbol:aint.deleteRows', SYMBOLS)).toEqual([])
  })

  test('a regular expression with a separator is tested against qualified names', () => {
    expect(matching('symbol:/^String::to_.*/', SYMBOLS)).toEqual(['String::to_string'])
    expect(matching('symbol:/^(Maint|Other)\\.delete/', SYMBOLS)).toEqual(['Maint.deleteRows', 'db::Maint::deleteRows', 'Other.deleteRows'])
  })
})
