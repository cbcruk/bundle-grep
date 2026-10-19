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
    }
  | {
      /** One file. */
      view: 'file'
      /** The query the file was opened from. */
      q: string
      /** `owner/name`. */
      repo: string
      /** The path in the repository. */
      path: string
      /** The 1-based line to scroll to and mark, if any. */
      line?: number
    }
  | {
      /** The archive: repositories, sync, and restore. */
      view: 'repos'
      /** The query to go back to. */
      q: string
    }
