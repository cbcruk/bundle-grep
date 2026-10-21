/**
 * Types for running a sync or restore.
 *
 * @module
 */

/** What {@linkcode runJob} runs. */
export type Job =
  | {
      /** Sync sources into the archive. */
      kind: 'sync'
      /** `owner`, `owner/name`, a git URL, or a local path. */
      sources: string[]
    }
  | {
      /** Rebuild every search cache from its bundle. */
      kind: 'restore'
    }
