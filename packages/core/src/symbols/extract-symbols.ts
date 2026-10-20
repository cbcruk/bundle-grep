/**
 * Finds the definitions in source text with tree-sitter.
 *
 * @module
 */

import { readFile } from 'node:fs/promises'

import { Result } from 'better-result'
import runtimeWasm from 'web-tree-sitter/web-tree-sitter.wasm' with { type: 'file' }
import { Language, Parser, Query } from 'web-tree-sitter'

import { GRAMMARS } from './grammars'
import { SymbolParserError } from './symbols.errors'
import type { GrammarId, SymbolDefinition, SymbolKind } from './symbols.types'

/** Finds the definitions in one file's text with the grammar given. */
export type SymbolExtractor = (grammar: GrammarId, text: string) => SymbolDefinition[]

interface Loaded {
  language: Language
  query: Query
}

const DEFINITION = 'definition.'

let runtime: Promise<Result<void, SymbolParserError>> | undefined
const loaded = new Map<GrammarId, Promise<Result<Loaded, SymbolParserError>>>()

function failure(what: string, cause: unknown): SymbolParserError {
  return new SymbolParserError({ message: `Could not load ${what}: ${cause instanceof Error ? cause.message : String(cause)}` })
}

function loadRuntime(): Promise<Result<void, SymbolParserError>> {
  runtime ??= Result.tryPromise({
    try: async () => Parser.init({ wasmBinary: new Uint8Array(await readFile(runtimeWasm)) }),
    catch: cause => failure('tree-sitter', cause),
  })
  return runtime
}

function loadGrammar(id: GrammarId): Promise<Result<Loaded, SymbolParserError>> {
  let grammar = loaded.get(id)
  if (!grammar) {
    grammar = Result.tryPromise({
      try: async () => {
        const language = await Language.load(new Uint8Array(await readFile(GRAMMARS[id].wasm)))
        return { language, query: new Query(language, GRAMMARS[id].query) }
      },
      catch: cause => failure(`the ${id} grammar`, cause),
    })
    loaded.set(id, grammar)
  }
  return grammar
}

/**
 * Loads tree-sitter and the grammars given, and returns a function that
 * extracts definitions with them.
 *
 * Loading happens once per process; later calls reuse what was loaded. The
 * extractor is synchronous. A name captured by several patterns, such as a
 * method that is also a function, keeps the kind of the first pattern in the
 * query. A file the grammar cannot make sense of yields what it could parse,
 * and one tree-sitter fails on, or an extractor asked for a grammar it did
 * not load, yields nothing.
 *
 * @returns The extractor, or a {@linkcode SymbolParserError} when tree-sitter
 * or a grammar cannot be loaded.
 */
export async function loadExtractor(grammars: Iterable<GrammarId>): Promise<Result<SymbolExtractor, SymbolParserError>> {
  const started = await loadRuntime()
  if (started.isErr()) return started
  const ready = new Map<GrammarId, Loaded>()
  for (const id of new Set(grammars)) {
    const grammar = await loadGrammar(id)
    if (grammar.isErr()) return grammar
    ready.set(id, grammar.value)
  }
  const parser = new Parser()

  return Result.ok((id, text) => {
    const grammar = ready.get(id)
    if (!grammar) return []
    parser.setLanguage(grammar.language)
    const tree = Result.try(() => parser.parse(text)).unwrapOr(null)
    if (!tree) return []
    try {
      const found = new Map<number, { pattern: number; symbol: SymbolDefinition }>()
      for (const match of grammar.query.matches(tree.rootNode)) {
        const name = match.captures.find(capture => capture.name === 'name')?.node
        const definition = match.captures.find(capture => capture.name.startsWith(DEFINITION))
        if (!name || !definition || name.text === '') continue
        const existing = found.get(name.startIndex)
        if (existing && existing.pattern <= match.patternIndex) continue
        const { row } = name.startPosition
        found.set(name.startIndex, {
          pattern: match.patternIndex,
          symbol: {
            name: name.text,
            kind: definition.name.slice(DEFINITION.length) as SymbolKind,
            line: row + 1,
            column: name.startPosition.column,
          },
        })
      }
      return [...found.entries()].sort(([a], [b]) => a - b).map(([, { symbol }]) => symbol)
    } finally {
      tree.delete()
    }
  })
}
