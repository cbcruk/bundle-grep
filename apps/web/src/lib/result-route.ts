/**
 * Where a search result opens: the file, at the commit it was found in.
 *
 * @module
 */

import type { ChangedLine, CommitInfo, MatchRange } from '@bundle-grep/core'

import type { CommitResult, FileResult } from '../hooks/use-search.types'
import type { FileRoute, QuerySearch } from './route.types'

/**
 * The file view of a matching file at its first match, at the `ref:` it was found in if any.
 *
 * @param from The search the file was found by, which the file view keeps so that going back shows the same results.
 */
export function fileRoute(from: QuerySearch, file: FileResult, line?: number): FileRoute {
  const first = line ?? file.lines.find(candidate => !candidate.context)?.number
  return {
    view: 'file',
    ...from,
    repo: file.repo,
    path: file.path,
    ...(file.commit ? { ref: file.commit } : {}),
    ...(first ? { line: first } : {}),
  }
}

/**
 * The file view of a changed line: at the commit for an added line, at its
 * parent for a removed one, since that is where the line's number points.
 *
 * A removed line of a root commit has no parent to show, so it opens the
 * commit itself without a line.
 */
export function changeRoute(from: QuerySearch, repo: string, commit: CommitInfo, path: string, line?: ChangedLine): FileRoute {
  const before = line?.change === 'removed' && commit.parent !== null
  return {
    view: 'file',
    ...from,
    repo,
    path,
    ref: before ? commit.parent! : commit.sha,
    ...(line && (before || line.change === 'added') ? { line: line.number } : {}),
  }
}

/** Where a commit result opens: its first file at its first change. */
export function commitRoute(from: QuerySearch, result: CommitResult): FileRoute | undefined {
  const file = result.files[0]
  return file && changeRoute(from, result.repo, result.commit, file.path, file.lines[0])
}

/**
 * The matches to highlight in the file a route shows, by line number.
 *
 * A `history:` search highlights the lines that commit added, and the lines
 * a commit whose parent this is removed; any other search highlights the
 * matches it found in the file at the same commit.
 */
export function routeHighlights(
  route: FileRoute,
  files: readonly FileResult[],
  commits: readonly CommitResult[],
): Map<number, MatchRange[]> {
  const out = new Map<number, MatchRange[]>()
  const add = (number: number, ranges: readonly MatchRange[]): void => {
    out.set(number, [...(out.get(number) ?? []), ...ranges])
  }
  for (const { repo, commit, files: changed } of commits) {
    if (repo !== route.repo || (commit.sha !== route.ref && commit.parent !== route.ref)) continue
    for (const file of changed) {
      if (file.path !== route.path) continue
      for (const line of file.lines) {
        const shown = line.change === 'added' ? commit.sha === route.ref : commit.parent === route.ref
        if (shown) add(line.number, line.ranges)
      }
    }
  }
  const file = files.find(candidate => candidate.repo === route.repo && candidate.path === route.path && candidate.commit === route.ref)
  for (const line of file?.lines ?? []) if (!line.context) add(line.number, line.ranges)
  return out
}
