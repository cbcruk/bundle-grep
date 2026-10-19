/**
 * The search plan a parsed query compiles into.
 *
 * A plan is a boolean expression over sets of files. Its leaves say how to
 * find one set — a `git grep -l`, a path test, a language — and `and`, `or`,
 * and `not` combine them as intersection, union, and complement against every
 * file in the tree. Repository qualifiers stay in the expression as
 * {@linkcode FilterLeaf}s until {@linkcode specializePlan} settles them for one
 * repository.
 *
 * @module
 */

import type { FilterKey, Pattern } from '../query/query.types'

/** Every file in the tree. */
export interface AllLeaf {
  /** Discriminant. */
  op: 'all'
}

/** No file at all. */
export interface NoneLeaf {
  /** Discriminant. */
  op: 'none'
}

/**
 * The files `git grep -l` lists for some patterns, matched case-insensitively.
 *
 * Turn it into arguments with {@linkcode grepArgs}.
 */
export interface GrepLeaf {
  /** `fixed` runs git with `-F`, `pcre` with `-P`. */
  engine: 'fixed' | 'pcre'
  /** Discriminant. */
  op: 'grep'
  /** The patterns, each passed with `-e`. */
  patterns: string[]
  /** `any` lists files matching one pattern or more; `all` adds `--all-match`, keeping files that match every pattern. */
  match: 'any' | 'all'
}

/** The files whose path matches a regular expression. */
export interface PathLeaf {
  /** Discriminant. */
  op: 'path'
  /** A JavaScript regular expression source, tested against the path relative to the repository root. */
  regex: string
  /** `false` only when the query opted out with a leading `(?-i)`. */
  ignoreCase: boolean
}

/** The files Linguist assigns to a language, by extension or exact filename. */
export interface LanguageLeaf {
  /** Discriminant. */
  op: 'language'
  /** The language's canonical Linguist name, such as `"TypeScript"`. */
  language: string
  /** Extensions including the dot, such as `".ts"`, compared case-insensitively. */
  extensions: string[]
  /** Exact file names, such as `"Dockerfile"`, compared case-insensitively. */
  filenames: string[]
}

/** A repository qualifier, which holds for every file of a repository or for none. */
export interface FilterLeaf {
  /** Discriminant. */
  op: 'filter'
  /** The qualifier key; `language:` compiles to a {@linkcode LanguageLeaf} instead. */
  key: Exclude<FilterKey, 'language'>
  /** The qualifier value. */
  value: string
}

/** A leaf that selects files within a repository. */
export type FileLeaf = AllLeaf | NoneLeaf | GrepLeaf | PathLeaf | LanguageLeaf

/** A boolean expression over `Leaf`s. */
export type Expr<Leaf> =
  | Leaf
  | {
      /** Intersection or union of the children. */
      op: 'and' | 'or'
      /** Two or more operands. */
      children: Expr<Leaf>[]
    }
  | {
      /** Complement of the child against every file in the tree. */
      op: 'not'
      /** The complemented operand. */
      child: Expr<Leaf>
    }

/** An expression that can be evaluated against one repository. */
export type FileExpr = Expr<FileLeaf>

/** An expression that may still depend on which repository is searched. */
export type QueryExpr = Expr<FileLeaf | FilterLeaf>

/** A compiled query. */
export interface SearchPlan {
  /** Which files match. */
  expr: QueryExpr
  /**
   * The patterns whose matching lines are worth showing: those that count
   * towards a file matching rather than against it.
   */
  highlight: Pattern[]
}

/** What `language:` needs to know about one Linguist language. */
export interface Language {
  /** The canonical name, such as `"TypeScript"`. */
  name: string
  /** Extensions including the dot. */
  extensions: string[]
  /** Exact file names. */
  filenames: string[]
}

/** Options for {@linkcode listMatchingFiles}. */
export interface ListMatchingFilesOptions {
  /** The repository, usually a bare clone of a bundle. */
  gitDir: string
  /** The expression, already free of repository qualifiers. */
  expr: FileExpr
  /** The tree to search. Defaults to `HEAD`. */
  ref?: string
  /** Stops the search, killing any git still running. */
  signal?: AbortSignal
}

/** Options for {@linkcode validateRegexes}. */
export interface ValidateRegexesOptions {
  /** Kills any git still running; the check then fails with a `GitError`. */
  signal?: AbortSignal
}
