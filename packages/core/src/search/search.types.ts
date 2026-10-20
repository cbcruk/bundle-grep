/**
 * Types for running a search across repositories.
 *
 * @module
 */

import type { GitError } from '../git/git.errors'
import type { FilterLeaf, SearchPlan, SymbolLeaf } from '../plan/plan.types'
import type { Pattern } from '../query/query.types'
import type { SymbolParserError } from '../symbols/symbols.errors'
import type { SymbolIndex } from '../symbols/symbols.types'
import type { PcreUnavailableError } from './search.errors'

/** A repository to search. */
export interface SearchRepo {
  /** The repository's name as qualifiers see it, such as `"cbcruk/barlo"`. */
  name: string
  /** The bare repository to run git in. */
  gitDir: string
  /** The tree to search. Defaults to `HEAD`. */
  ref?: string
}

/** One line as `git grep` printed it, before highlighting. */
export interface GrepLine {
  /** The path, with the `<ref>:` prefix removed. */
  path: string
  /** The 1-based line number. */
  number: number
  /** The 1-based byte offset of the first match; `undefined` for a context line. */
  byteColumn?: number
  /** The line's text. */
  text: string
}

/** A highlighted range within a line, in UTF-16 code units. */
export interface MatchRange {
  /** Index of the first highlighted character. */
  start: number
  /** Index just past the last highlighted character. */
  end: number
}

/** One line of a search result. */
export interface SearchLine {
  /** The 1-based line number. */
  number: number
  /** The line's text, without its line terminator. */
  text: string
  /** `true` for a line shown only as context around a match. */
  context: boolean
  /**
   * Where the line's first match starts, as a UTF-16 index: the column git
   * reported, or where a matching definition's name starts. `undefined` for
   * context lines.
   */
  column?: number
  /**
   * Every match of a highlight pattern in the line. Empty for context lines,
   * and for a match whose regex only PCRE understands — fall back to
   * {@linkcode SearchLine.column} then.
   */
  ranges: MatchRange[]
}

/** One line a commit added or removed, as `history:` shows it. */
export interface ChangedLine {
  /** Whether the commit added the line or removed it. */
  change: 'added' | 'removed'
  /** The 1-based line number: in the commit's version of the file when added, its parent's when removed. */
  number: number
  /** The line's text, without its line terminator. */
  text: string
  /** Where the `history:` pattern matches; empty when JavaScript cannot run the pattern. */
  ranges: MatchRange[]
}

/** One file a commit changed, as `history:` shows it. */
export interface ChangedFile {
  /** The path relative to the repository root, after the commit; before it, for a deleted file. */
  path: string
  /** What {@linkcode languageOf} says, if anything. */
  language?: string
  /** Changed lines the pattern matches, in diff order. */
  lines: ChangedLine[]
}

/** A commit `history:` found, with what it says about itself. */
export interface CommitInfo {
  /** The full commit id. */
  sha: string
  /** The first parent's id, or `null` for a root commit. */
  parent: string | null
  /** When it was authored, as ISO 8601. */
  date: string
  /** The author's name. */
  author: string
  /** The first line of the message. */
  subject: string
}

/** The file-level grouping of results, as GitHub's sidebar shows it. */
export interface SearchFacets {
  /** Matching files per language name; files of no known language are left out. */
  languages: Record<string, number>
  /** Matching files per repository name. */
  repos: Record<string, number>
  /** Matching files per top-level directory, with `""` for files at the root. */
  paths: Record<string, number>
}

/** Why a repository could not be searched. */
export type SearchRepoError = GitError | PcreUnavailableError | SymbolParserError

/** Something that happened during a search, in the order it happened. */
export type SearchEvent =
  | {
      /** A matching file, with its matching lines. */
      type: 'file'
      /** The repository's {@linkcode SearchRepo.name}. */
      repo: string
      /** The path relative to the repository root. */
      path: string
      /** What {@linkcode languageOf} says, if anything. */
      language?: string
      /**
       * Matching and context lines in line order. Empty when the file matched
       * on its path alone.
       */
      lines: SearchLine[]
      /** The commit searched, when the query named a `ref:`; `HEAD` otherwise. */
      commit?: string
    }
  | {
      /** A commit whose changes match `history:`, newest first within a repository. */
      type: 'commit'
      /** The repository's {@linkcode SearchRepo.name}. */
      repo: string
      /** The commit. */
      commit: CommitInfo
      /** The files whose changes match, with the matching lines. */
      files: ChangedFile[]
    }
  | {
      /** A repository that failed; the others carry on. */
      type: 'repo-error'
      /** The repository's {@linkcode SearchRepo.name}. */
      repo: string
      /** What went wrong. */
      error: SearchRepoError
    }
  | {
      /** The search is over. Always the last event. */
      type: 'done'
      /**
       * How many files matched across every repository searched, beyond any
       * limit. For `history:`, how many changed files matched, counting a
       * file once per commit.
       */
      totalFiles: number
      /** For `history:`, how many commits matched, beyond any limit. */
      totalCommits?: number
      /**
       * Grouped counts over the same files as `totalFiles`. For `history:`,
       * repositories count commits.
       */
      facets: SearchFacets
      /** `true` when `file` or `commit` events stopped at {@linkcode SearchOptions.limit}. */
      truncated: boolean
      /** Why the search stopped early, if it did; results so far are still valid. */
      stopped?: 'aborted' | 'timeout'
    }

/** What {@linkcode collectLines} needs to extract lines from one repository. */
export interface LineOptions {
  /** The repository. */
  repo: SearchRepo
  /** The tree argument for git. */
  ref: string
  /** The matching files to extract lines from. */
  files: readonly string[]
  /** The highlight patterns, from {@linkcode SearchPlan.highlight}. */
  patterns: readonly Pattern[]
  /** Context lines around each match. */
  context: number
  /** Most matching lines per file and pattern engine. */
  maxMatchesPerFile: number
  /** Kills git when aborted. */
  signal: AbortSignal
}

/** What {@linkcode collectSymbolLines} needs to show the definitions a query matched. */
export interface SymbolLineOptions {
  /** The repository. */
  repo: SearchRepo
  /** The symbol index of the tree being searched. */
  index: SymbolIndex
  /** The matching files to show definitions from. */
  files: readonly string[]
  /** The symbol leaves, from {@linkcode SearchPlan.symbols}. */
  leaves: readonly SymbolLeaf[]
  /** Context lines around each definition. */
  context: number
  /** Most definitions shown per file. */
  maxMatchesPerFile: number
  /** Kills git when aborted. */
  signal: AbortSignal
}

/**
 * Options for {@linkcode search}.
 *
 * @template Repo The repositories' type, which `holds` receives as given.
 */
export interface SearchOptions<Repo extends SearchRepo = SearchRepo> {
  /** The compiled query. */
  plan: SearchPlan
  /** The repositories to search. */
  repos: readonly Repo[]
  /**
   * Says whether a repository qualifier such as `repo:` or `is:fork` holds
   * for a repository; {@linkcode repoHolds} decides them for archived ones.
   */
  holds: (repo: Repo, filter: FilterLeaf) => boolean
  /** Most `file` events to emit, or `commit` events for `history:`. Defaults to `100`. */
  limit?: number
  /** Context lines around each match, as git's `-C`. Defaults to `0`. */
  context?: number
  /**
   * Most matching lines per file and pattern engine (`-F` or `-P`), and most
   * definitions per file for `symbol:`. Defaults to `20`.
   */
  maxMatchesPerFile?: number
  /** Repositories searched at once, at least `1`. Defaults to `4`. */
  concurrency?: number
  /** Stops the search after this many milliseconds. */
  timeoutMs?: number
  /** Stops the search when aborted. */
  signal?: AbortSignal
}
