/**
 * The tree-sitter grammars and tags queries that symbols are extracted with.
 *
 * Grammars are bundled as WebAssembly, so `bun build --compile` embeds them
 * and nothing needs installing. Each query captures a definition as
 * `@definition.<kind>` and its name as `@name`, following tree-sitter's tags
 * convention, and leaves references out. A definition may also capture the
 * type it belongs to as `@scope`, as a Go receiver or a Rust `impl` does, or
 * a C++ `A::B::c` declarator whole as `@qualified` in place of `@name`.
 *
 * @module
 */

import { createHash } from 'node:crypto'

import cWasm from 'tree-sitter-c/tree-sitter-c.wasm' with { type: 'file' }
import cPackage from 'tree-sitter-c/package.json'
import csharpWasm from 'tree-sitter-c-sharp/tree-sitter-c_sharp.wasm' with { type: 'file' }
import csharpPackage from 'tree-sitter-c-sharp/package.json'
import cppWasm from 'tree-sitter-cpp/tree-sitter-cpp.wasm' with { type: 'file' }
import cppPackage from 'tree-sitter-cpp/package.json'
import goWasm from 'tree-sitter-go/tree-sitter-go.wasm' with { type: 'file' }
import goPackage from 'tree-sitter-go/package.json'
import javaWasm from 'tree-sitter-java/tree-sitter-java.wasm' with { type: 'file' }
import javaPackage from 'tree-sitter-java/package.json'
import javascriptWasm from 'tree-sitter-javascript/tree-sitter-javascript.wasm' with { type: 'file' }
import javascriptPackage from 'tree-sitter-javascript/package.json'
import pythonWasm from 'tree-sitter-python/tree-sitter-python.wasm' with { type: 'file' }
import pythonPackage from 'tree-sitter-python/package.json'
import rubyWasm from 'tree-sitter-ruby/tree-sitter-ruby.wasm' with { type: 'file' }
import rubyPackage from 'tree-sitter-ruby/package.json'
import rustWasm from 'tree-sitter-rust/tree-sitter-rust.wasm' with { type: 'file' }
import rustPackage from 'tree-sitter-rust/package.json'
import typescriptPackage from 'tree-sitter-typescript/package.json'
import tsxWasm from 'tree-sitter-typescript/tree-sitter-tsx.wasm' with { type: 'file' }
import typescriptWasm from 'tree-sitter-typescript/tree-sitter-typescript.wasm' with { type: 'file' }

import { languageOf } from '../plan/languages'
import linguist from '../plan/languages.generated.json'
import cQuery from './queries/c.scm' with { type: 'text' }
import csharpQuery from './queries/c-sharp.scm' with { type: 'text' }
import cppQuery from './queries/cpp.scm' with { type: 'text' }
import ecmascriptQuery from './queries/ecmascript.scm' with { type: 'text' }
import goQuery from './queries/go.scm' with { type: 'text' }
import javaQuery from './queries/java.scm' with { type: 'text' }
import javascriptQuery from './queries/javascript.scm' with { type: 'text' }
import pythonQuery from './queries/python.scm' with { type: 'text' }
import rubyQuery from './queries/ruby.scm' with { type: 'text' }
import rustQuery from './queries/rust.scm' with { type: 'text' }
import typescriptQuery from './queries/typescript.scm' with { type: 'text' }
import type { Grammar, GrammarId } from './symbols.types'

/** The grammars by id. */
export const GRAMMARS: Readonly<Record<GrammarId, Grammar>> = {
  c: { wasm: cWasm, query: cQuery, version: cPackage.version, separator: '.' },
  cpp: { wasm: cppWasm, query: cQuery + cppQuery, version: cppPackage.version, separator: '::' },
  csharp: { wasm: csharpWasm, query: csharpQuery, version: csharpPackage.version, separator: '.' },
  go: { wasm: goWasm, query: goQuery, version: goPackage.version, separator: '.' },
  java: { wasm: javaWasm, query: javaQuery, version: javaPackage.version, separator: '.' },
  javascript: { wasm: javascriptWasm, query: ecmascriptQuery + javascriptQuery, version: javascriptPackage.version, separator: '.' },
  python: { wasm: pythonWasm, query: pythonQuery, version: pythonPackage.version, separator: '.' },
  ruby: { wasm: rubyWasm, query: rubyQuery, version: rubyPackage.version, separator: '::' },
  rust: { wasm: rustWasm, query: rustQuery, version: rustPackage.version, separator: '::' },
  tsx: { wasm: tsxWasm, query: ecmascriptQuery + typescriptQuery, version: typescriptPackage.version, separator: '.' },
  typescript: { wasm: typescriptWasm, query: ecmascriptQuery + typescriptQuery, version: typescriptPackage.version, separator: '.' },
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
