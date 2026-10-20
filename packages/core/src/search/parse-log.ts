/**
 * Parses the `git log` output that `history:` reads.
 *
 * @module
 */

import type { LoggedCommit, PatchedCommit, PatchedFile } from './history.types'

/** Separates commits in both formats; git writes it for `%x1e`. */
export const RECORD = '\x1e'

/** Parses `git log --format=%x1e%H --name-only -z` output into commits and their files. */
export function parseNameLog(output: string): LoggedCommit[] {
  return output
    .split(RECORD)
    .filter(record => record !== '')
    .map(record => {
      const [sha = '', ...files] = record.split('\0')
      return { sha, files: files.map(file => file.replace(/^\n/, '')).filter(file => file !== '') }
    })
}

const ESCAPES: Readonly<Record<string, number>> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 }

/**
 * Reads a path from a `---` or `+++` line: drops the tab git adds after a
 * name with spaces, undoes C-style quoting, and removes the `a/` or `b/`
 * prefix.
 *
 * @returns The path, or `undefined` for `/dev/null`.
 */
export function diffPath(raw: string): string | undefined {
  const name = raw.replace(/\t$/, '')
  if (name === '/dev/null') return undefined
  let path = name
  if (name.startsWith('"') && name.endsWith('"')) {
    const bytes: number[] = []
    for (let i = 1; i < name.length - 1; i++) {
      const char = name[i]!
      if (char !== '\\') {
        bytes.push(...Buffer.from(char, 'utf8'))
        continue
      }
      const next = name[++i]!
      const octal = /^[0-7]{3}/.exec(name.slice(i, i + 3))?.[0]
      if (octal) {
        bytes.push(Number.parseInt(octal, 8))
        i += 2
      } else {
        bytes.push(ESCAPES[next] ?? next.charCodeAt(0))
      }
    }
    path = Buffer.from(bytes).toString('utf8')
  }
  return path.replace(/^[ab]\//, '')
}

/**
 * Parses `git log -p -U0` output in the format {@linkcode PatchedCommit}
 * describes.
 *
 * Hunks are read by the line counts in their headers, so a changed line that
 * looks like a header is still read as a line.
 */
export function parsePatchLog(output: string): PatchedCommit[] {
  const commits: PatchedCommit[] = []
  for (const record of output.split(RECORD)) {
    if (record === '') continue
    const parts = record.split('\0')
    const fields = parts.slice(0, 5) as PatchedCommit['fields']
    const files: PatchedFile[] = []
    const lines = parts.slice(5).join('\0').split('\n')
    let file: PatchedFile | undefined
    let oldPath: string | undefined
    let removed = 0
    let added = 0
    let oldLine = 0
    let newLine = 0

    for (const line of lines) {
      if (removed > 0 || added > 0) {
        const text = line.slice(1).replace(/\r$/, '')
        if (line.startsWith('-') && removed > 0) {
          file?.lines.push({ change: 'removed', number: oldLine++, text })
          removed--
        } else if (line.startsWith('+') && added > 0) {
          file?.lines.push({ change: 'added', number: newLine++, text })
          added--
        }
        continue
      }
      if (line.startsWith('diff --git ')) {
        file = undefined
        oldPath = undefined
      } else if (line.startsWith('--- ')) {
        oldPath = diffPath(line.slice(4))
      } else if (line.startsWith('+++ ')) {
        const path = diffPath(line.slice(4)) ?? oldPath
        file = path === undefined ? undefined : { path, lines: [] }
        if (file) files.push(file)
      } else {
        const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
        if (hunk) {
          oldLine = Number(hunk[1])
          removed = hunk[2] === undefined ? 1 : Number(hunk[2])
          newLine = Number(hunk[3])
          added = hunk[4] === undefined ? 1 : Number(hunk[4])
        }
      }
    }
    commits.push({ fields, files })
  }
  return commits
}
