/**
 * Finds the definitions in source text with tree-sitter.
 *
 * @module
 */

import { Result } from 'better-result'
import { readFile } from 'node:fs/promises'
import { Language, Parser, Query, type Node } from 'web-tree-sitter'

import { GRAMMARS } from './grammars'
import { SymbolParserError } from './symbols.errors'
import type { GrammarId, SymbolDefinition, SymbolExtractor, SymbolKind } from './symbols.types'
import { wasmFile } from './wasm-file'

interface Loaded {
  language: Language
  query: Query
}

interface Found {
  pattern: number
  name: Node
  definition: Node
  kind: SymbolKind
  scope: string | undefined
}

const DEFINITION = 'definition.'

/** The kinds of definition whose members are named after them. */
const CONTAINERS: ReadonlySet<SymbolKind> = new Set(['class', 'enum', 'interface', 'module', 'struct', 'trait'])

/** Nodes that write a name after its scope, as C++ `A::b` and Ruby `A::B` do. */
const SCOPED: ReadonlySet<string> = new Set(['qualified_identifier', 'scope_resolution'])

/** What a C++ qualified declarator may end in. */
const DECLARATOR_NAMES: ReadonlySet<string> = new Set(['identifier', 'destructor_name', 'operator_name'])

let runtime: Promise<Result<void, SymbolParserError>> | undefined
const loaded = new Map<GrammarId, Promise<Result<Loaded, SymbolParserError>>>()

/** Says whether a node lies inside one of a type, such as a C declaration inside a function body. */
function isInside(node: Node, type: string): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) if (parent.type === type) return true
  return false
}

/** A C# `namespace N;`, which names every declaration after it in the file rather than ones inside it. */
const FILE_SCOPED = 'file_scoped_namespace_declaration'

/** Marks before a type that do not name it: pointers, references, lifetimes, and `mut`, `const` or `dyn`. */
const TYPE_PREFIX = /^(?:[*&]\s*|'\w+\s*|(?:mut|const|dyn)\s+)/

/**
 * Reads a type written as a scope, so `*Set[T]` and `&'a mut Foo<T>` read `Set` and `Foo`.
 *
 * Drops pointer and reference marks, lifetimes, generic arguments, trait
 * bounds after a `+`, a Rust path's leading `crate`, `self` or `super`, and
 * spaces.
 */
function scopeName(text: string): string {
  let name = text.trim()
  while (TYPE_PREFIX.test(name)) name = name.replace(TYPE_PREFIX, '')
  name = name.replace(/\s+/g, '')
  for (let previous = ''; previous !== name; ) {
    previous = name
    name = name.replace(/<[^<>]*>|\[[^[\]]*\]/g, '')
  }
  return name.replace(/\+.*$/, '').replace(/^(?:(?:crate|self|super)::)+/, '')
}

/** Follows a C++ `A::B::c` declarator down to the name it ends in. */
function declaredName(node: Node): Node | null {
  let current: Node | null = node
  while (current && SCOPED.has(current.type)) current = current.childForFieldName('name')
  return current && DECLARATOR_NAMES.has(current.type) ? current : null
}

/** Lists the scopes written before a name, outermost first, as `A` and `B` before `c` in `A::B::c`. */
function writtenScopes(name: Node): string[] {
  const scopes: string[] = []
  for (let node = name; node.parent && SCOPED.has(node.parent.type); node = node.parent) {
    if (node.parent.childForFieldName('name')?.id !== node.id) break
    const scope = node.parent.childForFieldName('scope')
    if (scope) scopes.unshift(scopeName(scope.text))
  }
  return scopes
}

/**
 * Names each definition after the definitions around it, its own `@scope`, and the scopes written before its name.
 *
 * The nearest enclosing container counts, unless a function or method comes
 * first: a definition inside a method is local to it, not a member of the
 * class. A C or C++ function's body counts as inside it, though the
 * definition captured is only its declarator. Outside any definition, a C# file-scoped namespace before it counts.
 */
function qualify(found: readonly Found[], separator: string): Map<Found, string> {
  const byNode = new Map<number, Found>()
  for (const entry of found) {
    byNode.set(entry.definition.id, entry)
    if (entry.definition.type !== 'function_declarator') continue
    let parent = entry.definition.parent
    while (parent?.type.endsWith('_declarator')) parent = parent.parent
    if (parent?.type === 'function_definition') byNode.set(parent.id, entry)
  }
  const fileScoped = found.find(entry => entry.definition.type === FILE_SCOPED)
  const qualified = new Map<Found, string>()
  const enclosing = (entry: Found): Found | null | undefined => {
    for (let parent = entry.definition.parent; parent; parent = parent.parent) {
      const around = byNode.get(parent.id)
      if (!around || around === entry) continue
      if (CONTAINERS.has(around.kind)) return around
      if (around.kind === 'function' || around.kind === 'method') return null
    }
    return undefined
  }
  const qualifiedOf = (entry: Found): string => {
    const known = qualified.get(entry)
    if (known !== undefined) return known
    const parts: string[] = []
    const around = enclosing(entry)
    if (around) parts.push(qualifiedOf(around))
    else if (around === undefined && fileScoped && fileScoped !== entry && fileScoped.definition.startIndex < entry.definition.startIndex) {
      parts.push(qualifiedOf(fileScoped))
    }
    if (entry.scope) parts.push(entry.scope)
    parts.push(...writtenScopes(entry.name), entry.name.text)
    const name = parts.join(separator)
    qualified.set(entry, name)
    return name
  }
  for (const entry of found) qualifiedOf(entry)
  return qualified
}

function failure(what: string, cause: unknown): SymbolParserError {
  return new SymbolParserError({ message: `Could not load ${what}: ${cause instanceof Error ? cause.message : String(cause)}` })
}

function loadRuntime(): Promise<Result<void, SymbolParserError>> {
  runtime ??= Result.tryPromise({
    try: async () => Parser.init({ wasmBinary: new Uint8Array(await readFile(wasmFile('web-tree-sitter/web-tree-sitter.wasm'))) }),
    catch: cause => failure('tree-sitter', cause),
  })
  return runtime
}

function loadGrammar(id: GrammarId): Promise<Result<Loaded, SymbolParserError>> {
  let grammar = loaded.get(id)
  if (!grammar) {
    grammar = Result.tryPromise({
      try: async () => {
        const language = await Language.load(new Uint8Array(await readFile(wasmFile(GRAMMARS[id].wasm))))
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
 * query. A pattern that sets `outside` to a node type, as with
 * `(#set! outside "compound_statement")`, skips definitions inside such a
 * node. Each definition inside a class, struct, interface, enum, trait or
 * module, or with a `@scope`, also gets a {@linkcode SymbolDefinition.qualified}
 * name. A file the grammar cannot make sense of yields what it could parse,
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
      const found = new Map<number, Found>()
      for (const match of grammar.query.matches(tree.rootNode)) {
        const capture = (name: string): Node | undefined => match.captures.find(candidate => candidate.name === name)?.node
        const written = capture('qualified')
        const name = capture('name') ?? (written && declaredName(written))
        const definition = match.captures.find(capture => capture.name.startsWith(DEFINITION))
        if (!name || !definition || name.text === '') continue
        const outside = match.setProperties?.outside
        if (outside && isInside(definition.node, outside)) continue
        const existing = found.get(name.startIndex)
        if (existing && existing.pattern <= match.patternIndex) continue
        const scope = capture('scope')
        found.set(name.startIndex, {
          pattern: match.patternIndex,
          name,
          definition: definition.node,
          kind: definition.name.slice(DEFINITION.length) as SymbolKind,
          scope: scope && scopeName(scope.text),
        })
      }
      const entries = [...found.entries()].sort(([a], [b]) => a - b).map(([, entry]) => entry)
      const qualified = qualify(entries, GRAMMARS[id].separator)
      return entries.map(entry => {
        const symbol: SymbolDefinition = {
          name: entry.name.text,
          kind: entry.kind,
          line: entry.name.startPosition.row + 1,
          column: entry.name.startPosition.column,
        }
        const full = qualified.get(entry)
        if (full !== undefined && full !== symbol.name) symbol.qualified = full
        return symbol
      })
    } catch {
      return []
    } finally {
      tree.delete()
    }
  })
}
