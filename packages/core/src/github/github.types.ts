/**
 * Types for asking the GitHub CLI about repositories.
 *
 * @module
 */

/** Options for {@linkcode listGithubRepos} and {@linkcode viewGithubRepo}. */
export interface GithubOptions {
  /** The `gh` executable to run; `gh` on the `PATH` by default. */
  gh?: string
  /** Kills `gh` when aborted. */
  signal?: AbortSignal
}

/** Options for {@linkcode listGithubRepos}. */
export interface ListGithubReposOptions extends GithubOptions {
  /** Most repositories to list; 1000 by default. */
  limit?: number
}
