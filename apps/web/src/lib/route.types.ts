/**
 * Types for the screens the UI can show, as the address bar records them.
 *
 * @module
 */

/**
 * A screen and its arguments.
 *
 * Every screen carries the last query, so leaving the file view or the
 * repository list goes back to the same results.
 */
export type Route =
  | {
      /** Search results, or the empty start page when `q` is empty. */
      view: 'search'
      /** The query. */
      q: string
      /** `true` to ask for as many files as the server sends, after "Show more". */
      more?: true
    }
  | {
      /** One file. */
      view: 'file'
      /** The query the file was opened from. */
      q: string
      /** Whether that search asked for as many files as the server sends. */
      more?: true
      /** `owner/name`. */
      repo: string
      /** The path in the repository. */
      path: string
      /** The commit to show the file at, as a full id; `HEAD` when absent. */
      ref?: string
      /** The 1-based line to scroll to and mark, if any. */
      line?: number
    }
  | {
      /** The archive: repositories, sync, and restore. */
      view: 'repos'
      /** The query to go back to. */
      q: string
    }

/** The file screen. */
export type FileRoute = Extract<Route, { view: 'file' }>

/** The search parameters every search screen shares. */
export interface QuerySearch {
  /** The query; `''` for the start page. */
  q: string
  /** `true` after "Show more". */
  more?: true
}

/** The search parameters of the file screen, beside {@linkcode QuerySearch}. */
export interface FileSearch {
  /** The commit to show the file at, as a full id; `HEAD` when absent. */
  ref?: string
  /** The 1-based line to scroll to and mark. */
  line?: number
}
