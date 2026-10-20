/**
 * Builds and caches the symbol index of a repository's tree.
 *
 * @module
 */

import { Result } from 'better-result'
import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { catBlobs } from '../git/cat-blobs'
import { resolveCommit } from '../git/resolve-commit'
import { runGit, splitNul } from '../git/run-git'
import { loadExtractor } from './extract-symbols'
import { grammarFor, INDEXER } from './grammars'
import type {
  GrammarId,
  IndexedFile,
  SymbolDefinition,
  SymbolIndex,
  SymbolIndexError,
  SymbolIndexOptions,
  SymbolKind,
} from './symbols.types'

/** The index's file inside the bare repository, which is derived data like the rest of it. */
const INDEX_FILE = 'bundle-grep-symbols.json'

/** Larger files are left out, as generated or vendored code rather than definitions worth finding. */
const MAX_FILE_BYTES = 1024 * 1024

/** How far into a file to look for a NUL byte, as git does to tell binary files apart. */
const BINARY_PROBE_BYTES = 8000

/** The stored format and extraction rules; raise it when either changes, so older indexes are rebuilt. */
const VERSION = 1

type StoredSymbol = [name: string, kind: SymbolKind, line: number, column: number]

interface StoredIndex {
  version: typeof VERSION
  indexer: string
  commit: string
  files: Record<string, [oid: string, symbols: StoredSymbol[]]>
}

interface TreeFile {
  path: string
  oid: string
  grammar: GrammarId
}

function isStoredIndex(value: unknown): value is StoredIndex {
  if (typeof value !== 'object' || value === null) return false
  const { version, indexer, commit, files } = value as Record<string, unknown>
  return version === VERSION && typeof indexer === 'string' && typeof commit === 'string' && typeof files === 'object' && files !== null
}

/** Reads a stored index, treating one that cannot be read or has the wrong shape as missing. */
async function readStored(path: string): Promise<{ indexer: string; index: SymbolIndex } | undefined> {
  const text = await Result.tryPromise(() => readFile(path, 'utf8'))
  if (text.isErr()) return undefined
  const value = Result.try(() => JSON.parse(text.value) as unknown)
  if (value.isErr() || !isStoredIndex(value.value)) return undefined
  const stored = value.value
  return Result.try(() => ({ indexer: stored.indexer, index: fromStored(stored) })).unwrapOr(undefined)
}

function fromStored(stored: StoredIndex): SymbolIndex {
  const files = new Map<string, IndexedFile>()
  for (const [path, [oid, symbols]] of Object.entries(stored.files)) {
    if (typeof oid !== 'string') throw new TypeError(`Malformed entry for ${path}`)
    files.set(path, { oid, symbols: symbols.map(([name, kind, line, column]) => ({ name, kind, line, column })) })
  }
  return { commit: stored.commit, files }
}

function toStored(index: SymbolIndex): StoredIndex {
  const files: StoredIndex['files'] = {}
  for (const [path, { oid, symbols }] of index.files) {
    files[path] = [oid, symbols.map(({ name, kind, line, column }) => [name, kind, line, column])]
  }
  return { version: VERSION, indexer: INDEXER, commit: index.commit, files }
}

/** Writes the index beside its destination and renames it into place; a failure only costs a rebuild later. */
async function save(path: string, index: SymbolIndex): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  const written = await Result.tryPromise(async () => {
    await writeFile(temporary, JSON.stringify(toStored(index)))
    await rename(temporary, path)
  })
  if (written.isErr()) await rm(temporary, { force: true }).catch(() => undefined)
}

/** Lists the files of a tree that a grammar covers and that are small enough to index. */
function coveredFiles(lsTree: Buffer): TreeFile[] {
  const files: TreeFile[] = []
  for (const entry of splitNul(lsTree)) {
    const match = /^100(?:644|755) blob ([0-9a-f]+) +(\d+)\t(.*)$/s.exec(entry)
    if (!match || Number(match[2]) > MAX_FILE_BYTES) continue
    const grammar = grammarFor(match[3]!)
    if (grammar) files.push({ path: match[3]!, oid: match[1]!, grammar })
  }
  return files
}

/**
 * Returns the symbol index of a commit, building it when the cached one is
 * missing or out of date.
 *
 * The index lists the definitions in every file whose language has a grammar
 * — see {@linkcode symbolLanguages} — and is cached in the bare repository,
 * keyed by commit and by the grammars and queries it was built with. When the
 * commit changes, files whose blob is unchanged keep their definitions and
 * only the rest are parsed again. Files over 1 MiB and symbolic links are
 * left out, and binary files are listed as defining nothing.
 *
 * Only an index of `HEAD`'s commit is saved, so searching another ref does
 * not displace it; another ref's index still reuses what the saved one
 * knows. Saving is best effort: a repository that cannot be written to is
 * indexed again next time.
 *
 * @returns The index, or a {@linkcode SymbolIndexError} when git fails or
 * tree-sitter cannot be loaded.
 *
 * @example Listing a repository's functions
 * ```ts
 * import { symbolIndex } from "@bundle-grep/core";
 *
 * const index = (await symbolIndex("./cache/cbcruk/barlo.git")).unwrap();
 * for (const [path, file] of index.files) {
 *   for (const symbol of file.symbols) if (symbol.kind === "function") console.log(`${path}:${symbol.line} ${symbol.name}`);
 * }
 * ```
 */
export async function symbolIndex(
  gitDir: string,
  options: SymbolIndexOptions = {},
): Promise<Result<SymbolIndex, SymbolIndexError>> {
  const { ref = 'HEAD', signal } = options
  return Result.gen(async function* () {
    const resolved = yield* Result.await(runGit(['rev-parse', '--verify', `${ref}^{commit}`], { cwd: gitDir, signal }))
    const commit = resolved.stdout.toString('utf8').trim()
    const path = join(gitDir, INDEX_FILE)
    const stored = await readStored(path)
    if (stored?.indexer === INDEXER && stored.index.commit === commit) return Result.ok(stored.index)

    const key = (grammar: GrammarId, oid: string): string => `${grammar}:${oid}`
    const known = new Map<string, SymbolDefinition[]>()
    if (stored?.indexer === INDEXER) {
      for (const [file, { oid, symbols }] of stored.index.files) {
        const grammar = grammarFor(file)
        if (grammar) known.set(key(grammar, oid), symbols)
      }
    }

    const tree = yield* Result.await(runGit(['ls-tree', '-r', '-l', '-z', commit], { cwd: gitDir, signal }))
    const covered = coveredFiles(tree.stdout)
    const unknown = covered.filter(file => !known.has(key(file.grammar, file.oid)))

    if (unknown.length > 0) {
      const extract = yield* Result.await(loadExtractor(unknown.map(file => file.grammar)))
      const grammars = new Map<string, Set<GrammarId>>()
      for (const file of unknown) grammars.set(file.oid, (grammars.get(file.oid) ?? new Set()).add(file.grammar))
      yield* Result.await(
        catBlobs(
          gitDir,
          [...grammars.keys()],
          (oid, content) => {
            const binary = content.subarray(0, BINARY_PROBE_BYTES).includes(0)
            const text = binary ? '' : content.toString('utf8')
            for (const grammar of grammars.get(oid) ?? []) known.set(key(grammar, oid), binary ? [] : extract(grammar, text))
          },
          signal,
        ),
      )
    }

    const files = new Map<string, IndexedFile>()
    for (const file of covered) {
      files.set(file.path, { oid: file.oid, symbols: known.get(key(file.grammar, file.oid)) ?? [] })
    }
    const index: SymbolIndex = { commit, files }
    const head = ref === 'HEAD' ? commit : (await resolveCommit(gitDir, 'HEAD', signal)).unwrapOr(undefined)
    if (head === commit) await save(path, index)
    return Result.ok(index)
  })
}
