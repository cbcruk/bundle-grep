/**
 * Turns the definitions a `symbol:` query matched into result lines.
 *
 * @module
 */

import { Result } from 'better-result'

import { catBlobs } from '../git/cat-blobs'
import type { GitError } from '../git/git.errors'
import { symbolMatcher } from '../symbols/match-symbols'
import type { SymbolDefinition } from '../symbols/symbols.types'
import type { SearchLine, SymbolLineOptions } from './search.types'

function linesOf(definitions: readonly SymbolDefinition[], text: string, context: number): SearchLine[] {
  const source = text.split('\n')
  if (text.endsWith('\n')) source.pop()
  const at = (number: number): string => source[number - 1]!.replace(/\r$/, '')
  const lines = new Map<number, SearchLine>()
  for (const { name, line, column } of definitions) {
    if (line > source.length) continue
    const range = { start: column, end: column + name.length }
    const existing = lines.get(line)
    if (existing && !existing.context) {
      existing.ranges.push(range)
      existing.column = Math.min(existing.column ?? column, column)
    } else {
      lines.set(line, { number: line, text: at(line), context: false, column, ranges: [range] })
    }
    for (let number = Math.max(1, line - context); number <= Math.min(source.length, line + context); number++) {
      if (!lines.has(number)) lines.set(number, { number, text: at(number), context: true, ranges: [] })
    }
  }
  for (const line of lines.values()) line.ranges.sort((a, b) => a.start - b.start)
  return [...lines.values()].sort((a, b) => a.number - b.number)
}

/**
 * Collects the definition lines of matching symbols in a set of files, with
 * their names highlighted.
 *
 * Lines come from the blobs the index was built from, read with one git
 * process, and at most `maxMatchesPerFile` definitions are shown per file.
 *
 * @returns Lines by path, for files with a matching definition, or the
 * {@linkcode GitError} of reading the blobs.
 */
export async function collectSymbolLines(options: SymbolLineOptions): Promise<Result<Map<string, SearchLine[]>, GitError>> {
  const { repo, index, files, leaves, context, maxMatchesPerFile, signal } = options
  const matches = symbolMatcher(leaves)
  const wanted = new Map<string, { path: string; definitions: SymbolDefinition[] }[]>()
  for (const path of files) {
    const file = index.files.get(path)
    const definitions = file?.symbols.filter(matches).slice(0, maxMatchesPerFile) ?? []
    if (!file || definitions.length === 0) continue
    wanted.set(file.oid, [...(wanted.get(file.oid) ?? []), { path, definitions }])
  }

  const byFile = new Map<string, SearchLine[]>()
  if (wanted.size === 0) return Result.ok(byFile)
  const read = await catBlobs(
    repo.gitDir,
    [...wanted.keys()],
    (oid, content) => {
      const text = content.toString('utf8')
      for (const { path, definitions } of wanted.get(oid) ?? []) byFile.set(path, linesOf(definitions, text, context))
    },
    signal,
  )
  return read.map(() => byFile)
}

/**
 * Merges two sets of lines for one file: a matching line wins over the same
 * line shown as context, and two matching lines join their ranges, keeping
 * one of each.
 */
export function mergeLines(a: readonly SearchLine[], b: readonly SearchLine[]): SearchLine[] {
  const lines = new Map<number, SearchLine>(a.map(line => [line.number, line]))
  for (const line of b) {
    const existing = lines.get(line.number)
    if (!existing || (existing.context && !line.context)) {
      lines.set(line.number, line)
    } else if (!existing.context && !line.context) {
      lines.set(line.number, {
        ...existing,
        column: Math.min(existing.column ?? line.column ?? 0, line.column ?? existing.column ?? 0),
        ranges: [...existing.ranges, ...line.ranges]
          .sort((x, y) => x.start - y.start || x.end - y.end)
          .filter((range, i, ranges) => i === 0 || range.start !== ranges[i - 1]!.start || range.end !== ranges[i - 1]!.end),
      })
    }
  }
  return [...lines.values()].sort((x, y) => x.number - y.number)
}
