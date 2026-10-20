/**
 * Types for searching what commits changed with `history:`.
 *
 * @module
 */

import type { FileExpr, HistoryPattern } from '../plan/plan.types'
import type { ChangedFile, CommitInfo } from './search.types'

/** One commit of the first pass, with the files whose changes matched. */
export interface LoggedCommit {
  /** The full commit id. */
  sha: string
  /** The matching files, as `--name-only -z` lists them. */
  files: string[]
}

/** One commit of the second pass, with its metadata and patch. */
export interface PatchedCommit {
  /** The fields of `%H%x00%P%x00%aI%x00%an%x00%s%x00`, in order. */
  fields: [sha: string, parents: string, date: string, author: string, subject: string]
  /** Files in diff order, with every line they added or removed. */
  files: PatchedFile[]
}

/** One file of a patch. */
export interface PatchedFile {
  /** The path after the commit, or before it for a deleted file. */
  path: string
  /** Added and removed lines, in diff order. */
  lines: { change: 'added' | 'removed'; number: number; text: string }[]
}

/** What {@linkcode matchingCommits} needs. */
export interface MatchingCommitsOptions {
  /** The repository to run git in. */
  gitDir: string
  /** Where history starts: `HEAD` or a commit id. */
  ref: string
  /** What the changed lines must match. */
  history: HistoryPattern
  /** Which changed files count, from `path:` and `language:`. */
  expr: FileExpr
  /** Kills git when aborted. */
  signal: AbortSignal
}

/** What {@linkcode describeCommits} needs. */
export interface DescribeCommitsOptions {
  /** The repository to run git in. */
  gitDir: string
  /** The commits to describe, with the files that count for each. */
  commits: readonly LoggedCommit[]
  /** What the changed lines must match. */
  history: HistoryPattern
  /** Most changed lines shown per file. */
  maxMatchesPerFile: number
  /** Kills git when aborted. */
  signal: AbortSignal
}

/** A commit {@linkcode describeCommits} described. */
export interface DescribedCommit {
  /** Who made it, when, and why. */
  commit: CommitInfo
  /** The files that count, with their matching lines. */
  files: ChangedFile[]
}
