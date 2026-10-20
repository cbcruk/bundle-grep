/**
 * Types for the symbol index that answers `symbol:`.
 *
 * @module
 */

import type { GitError } from '../git/git.errors'
import type { SymbolParserError } from './symbols.errors'

/** What kind of definition a symbol is, from the tags query capture that found it. */
export type SymbolKind =
  | 'class'
  | 'constant'
  | 'enum'
  | 'function'
  | 'interface'
  | 'macro'
  | 'method'
  | 'module'
  | 'struct'
  | 'trait'
  | 'type'
  | 'variable'

/** The grammars symbols are extracted with. */
export type GrammarId = 'c' | 'cpp' | 'csharp' | 'go' | 'java' | 'javascript' | 'python' | 'ruby' | 'rust' | 'tsx' | 'typescript'

/** What extracting with one grammar needs. */
export interface Grammar {
  /** The grammar's WebAssembly file. */
  wasm: string
  /** The tags query, definitions only. */
  query: string
  /** The grammar package's version, which a change of invalidates every index. */
  version: string
  /** What joins a definition's name to its container's, as in `Maint.deleteRows` or `Maint::deleteRows`. */
  separator: '.' | '::'
}

/** Finds the definitions in one file's text with the grammar given. */
export type SymbolExtractor = (grammar: GrammarId, text: string) => SymbolDefinition[]

/** One definition found in a file. */
export interface SymbolDefinition {
  /** The defined name, such as `"useState"`. */
  name: string
  /**
   * The name with the definitions around it, outermost first, joined by the
   * language's {@linkcode Grammar.separator}, such as `"Maint.deleteRows"`;
   * absent when nothing encloses the definition.
   */
  qualified?: string
  /** What it defines. */
  kind: SymbolKind
  /** The 1-based line the name is on. */
  line: number
  /** Where the name starts in its line, in UTF-16 code units. */
  column: number
}

/** The definitions in one file of the indexed tree. */
export interface IndexedFile {
  /** The blob the definitions were read from, so an unchanged file is not parsed again. */
  oid: string
  /** The definitions, in the order they appear. */
  symbols: SymbolDefinition[]
}

/** The definitions in every file of one commit that a grammar covers. */
export interface SymbolIndex {
  /** The commit that was indexed. */
  commit: string
  /** Files by path, including covered files that define nothing. */
  files: Map<string, IndexedFile>
}

/** Options for {@linkcode symbolIndex}. */
export interface SymbolIndexOptions {
  /** The tree to index. Defaults to `HEAD`. */
  ref?: string
  /** Stops indexing, killing any git still running. */
  signal?: AbortSignal
}

/** Why a symbol index could not be built. */
export type SymbolIndexError = GitError | SymbolParserError
