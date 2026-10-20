/**
 * The tree-sitter grammars and tags queries that symbols are extracted with.
 *
 * Grammars are WebAssembly, named here by their package path and found with
 * `wasmFile` when first used, so nothing native needs building. Each query captures a definition as
 * `@definition.<kind>` and its name as `@name`, following tree-sitter's tags
 * convention, and leaves references out. A definition may also capture the
 * type it belongs to as `@scope`, as a Go receiver or a Rust `impl` does, or
 * a C++ `A::B::c` declarator whole as `@qualified` in place of `@name`.
 *
 * @module
 */

import { createHash } from 'node:crypto'

import cPackage from 'tree-sitter-c/package.json' with { type: 'json' }
import csharpPackage from 'tree-sitter-c-sharp/package.json' with { type: 'json' }
import cppPackage from 'tree-sitter-cpp/package.json' with { type: 'json' }
import goPackage from 'tree-sitter-go/package.json' with { type: 'json' }
import javaPackage from 'tree-sitter-java/package.json' with { type: 'json' }
import javascriptPackage from 'tree-sitter-javascript/package.json' with { type: 'json' }
import pythonPackage from 'tree-sitter-python/package.json' with { type: 'json' }
import rubyPackage from 'tree-sitter-ruby/package.json' with { type: 'json' }
import rustPackage from 'tree-sitter-rust/package.json' with { type: 'json' }
import typescriptPackage from 'tree-sitter-typescript/package.json' with { type: 'json' }

import { languageOf } from '../plan/languages'
import linguist from '../plan/languages.generated.json' with { type: 'json' }
import { query as cQuery } from './queries/c'
import { query as csharpQuery } from './queries/c-sharp'
import { query as cppQuery } from './queries/cpp'
import { query as ecmascriptQuery } from './queries/ecmascript'
import { query as goQuery } from './queries/go'
import { query as javaQuery } from './queries/java'
import { query as javascriptQuery } from './queries/javascript'
import { query as pythonQuery } from './queries/python'
import { query as rubyQuery } from './queries/ruby'
import { query as rustQuery } from './queries/rust'
import { query as typescriptQuery } from './queries/typescript'
import type { Grammar, GrammarId } from './symbols.types'

/** The grammars by id. */
export const GRAMMARS: Readonly<Record<GrammarId, Grammar>> = {
  c: { wasm: 'tree-sitter-c/tree-sitter-c.wasm', query: cQuery, version: cPackage.version, separator: '.' },
  cpp: { wasm: 'tree-sitter-cpp/tree-sitter-cpp.wasm', query: cQuery + cppQuery, version: cppPackage.version, separator: '::' },
  csharp: { wasm: 'tree-sitter-c-sharp/tree-sitter-c_sharp.wasm', query: csharpQuery, version: csharpPackage.version, separator: '.' },
  go: { wasm: 'tree-sitter-go/tree-sitter-go.wasm', query: goQuery, version: goPackage.version, separator: '.' },
  java: { wasm: 'tree-sitter-java/tree-sitter-java.wasm', query: javaQuery, version: javaPackage.version, separator: '.' },
  javascript: { wasm: 'tree-sitter-javascript/tree-sitter-javascript.wasm', query: ecmascriptQuery + javascriptQuery, version: javascriptPackage.version, separator: '.' },
  python: { wasm: 'tree-sitter-python/tree-sitter-python.wasm', query: pythonQuery, version: pythonPackage.version, separator: '.' },
  ruby: { wasm: 'tree-sitter-ruby/tree-sitter-ruby.wasm', query: rubyQuery, version: rubyPackage.version, separator: '::' },
  rust: { wasm: 'tree-sitter-rust/tree-sitter-rust.wasm', query: rustQuery, version: rustPackage.version, separator: '::' },
  tsx: { wasm: 'tree-sitter-typescript/tree-sitter-tsx.wasm', query: ecmascriptQuery + typescriptQuery, version: typescriptPackage.version, separator: '.' },
  typescript: { wasm: 'tree-sitter-typescript/tree-sitter-typescript.wasm', query: ecmascriptQuery + typescriptQuery, version: typescriptPackage.version, separator: '.' },
}

const BY_LANGUAGE: Readonly<Record<string, GrammarId>> = {
  C: 'c',
  'C#': 'csharp',
  'C++': 'cpp',
  Go: 'go',
  Java: 'java',
  JavaScript: 'javascript',
  Python: 'python',
  Ruby: 'ruby',
  Rust: 'rust',
  TSX: 'tsx',
  TypeScript: 'typescript',
}

/**
 * Identifies the grammars, queries, and language data an index was built
 * with, so an index built by another version is rebuilt rather than trusted.
 */
export const INDEXER: string = createHash('sha256')
  .update(JSON.stringify([Object.entries(GRAMMARS).map(([id, { query, version, separator }]) => [id, version, query, separator]), BY_LANGUAGE]))
  .update(JSON.stringify(linguist))
  .digest('hex')
  .slice(0, 16)

/**
 * Picks the grammar for a path, by the language {@linkcode languageOf} names.
 *
 * A `.h` header is parsed as C++, which reads C as well and also finds the
 * classes of C++ headers.
 *
 * @returns The grammar, or `undefined` for a file whose language has none.
 */
export function grammarFor(path: string): GrammarId | undefined {
  const language = languageOf(path)
  if (language === 'C' && /\.h$/i.test(path)) return 'cpp'
  return language === undefined ? undefined : BY_LANGUAGE[language]
}

/**
 * Lists the languages `symbol:` finds definitions in.
 *
 * @returns Linguist's names for them, in alphabetical order.
 */
export function symbolLanguages(): string[] {
  return Object.keys(BY_LANGUAGE)
}
