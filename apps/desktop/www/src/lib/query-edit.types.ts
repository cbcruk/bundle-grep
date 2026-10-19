/**
 * Types for editing queries from the sidebar.
 *
 * @module
 */

/** One entry in a sidebar facet: a language, repository, or top-level directory. */
export interface Facet {
  /** Which facet it belongs to, which is also the qualifier it adds. */
  kind: 'language' | 'repo' | 'path'
  /** The language name, `owner/name`, or directory, with `""` for the root. */
  value: string
}
