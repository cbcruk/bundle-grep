/**
 * Parses the `git log` output that `history:` reads.
 *
 * @module
 */

import type { LoggedCommit, NameLogParser, PatchedCommit, PatchedFile } from './history.types'

/** Starts each commit in both formats; git writes it for `%x1e`. */
const MARK = '\x1e'

/** A full SHA-1 or SHA-256 commit id. */
const ID = '[0-9a-f]{40}(?:[0-9a-f]{24})?'

/** A whole field holding a commit's marker and id, as pass 1 writes it. */
const NAME_RECORD = new RegExp(`^\n?${MARK}(${ID})$`)

/**
 * Where a commit starts in pass 2: the marker at the start of a line,
 * followed by an id and a NUL, which no patch line can hold.
 */
const PATCH_RECORD = new RegExp(`(?:^|\n)${MARK}(?=${ID}\0)`)

/**
 * Reads `git log --format=%x1e%H --name-only -z` output as it streams,
 * handing over each commit once its last file has arrived.
 *
 * The output is read field by field, so a path holding the marker byte is
 * still read as a path. Call `end` after the last chunk to hand over the
 * final commit; `open` shows the commit still being read while the output
 * so far ends between two fields.
 */
export function createNameLogParser(onCommit: (commit: LoggedCommit) => void): NameLogParser {
  let pending = ''
  let current: LoggedCommit | undefined
  const field = (text: string): void => {
    const sha = NAME_RECORD.exec(text)?.[1]
    const path = text.replace(/^\n/, '')
    if (sha) {
      if (current) onCommit(current)
      current = { sha, files: [] }
    } else if (path !== '') {
      current?.files.push(path)
    }
  }
  return {
    open: () => (pending === '' ? current : undefined),
    push: text => {
      const fields = (pending + text).split('\0')
      pending = fields.pop()!
      for (const text of fields) field(text)
    },
    end: () => {
      if (pending !== '') field(pending)
      pending = ''
      if (current) onCommit(current)
      current = undefined
    },
  }
}

/** Parses the whole of `git log --format=%x1e%H --name-only -z` output into commits and their files. */
export function parseNameLog(output: string): LoggedCommit[] {
  const commits: LoggedCommit[] = []
  const parser = createNameLogParser(commit => commits.push(commit))
  parser.push(output)
  parser.end()
  return commits
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
 * looks like a header is still read as a line, and context lines, which git
 * adds between nearby hunks under `diff.interHunkContext`, are counted but
 * not kept. Commits are split only where a line starts with the marker and a
 * commit id, so the marker byte inside a changed line or a subject is kept
 * as text; a record too short to hold the format's fields is left out.
 */
export function parsePatchLog(output: string): PatchedCommit[] {
  const commits: PatchedCommit[] = []
  for (const record of output.split(PATCH_RECORD)) {
    const parts = record.split('\0')
    if (parts.length < 6) continue
    const [sha, parents, date, author, subject] = parts as [string, string, string, string, string]
    const fields: PatchedCommit['fields'] = [sha, parents, date, author, subject]
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
        } else if (line.startsWith(' ')) {
          oldLine++
          newLine++
          removed = Math.max(0, removed - 1)
          added = Math.max(0, added - 1)
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
