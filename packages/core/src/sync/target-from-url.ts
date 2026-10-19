/**
 * Derives a sync target from a repository URL.
 *
 * @module
 */

import { Result } from 'better-result'

import { InvalidRepoNameError } from '../archive/archive.errors'
import type { SyncTarget } from './sync.types'

/**
 * Turns a repository URL or path into a target named after its last two path segments.
 *
 * Works for HTTPS and SSH URLs as well as local paths: the last segment, minus
 * any `.git`, is the name and the one before it the owner. Nothing about the
 * repository is looked up, so for a GitHub URL prefer
 * {@linkcode viewGithubRepo}, which also reports whether it is a fork or
 * archived.
 *
 * @returns The target, or an {@linkcode InvalidRepoNameError} when the URL has
 * fewer than two path segments.
 *
 * @example Adding a repository by URL
 * ```ts
 * import { targetFromUrl } from "@bundle-grep/core";
 *
 * const target = targetFromUrl("git@github.com:cbcruk/barlo.git").unwrap();
 * ```
 *
 * `target` is `{ owner: "cbcruk", name: "barlo", url: "git@github.com:cbcruk/barlo.git" }`.
 */
export function targetFromUrl(url: string): Result<SyncTarget, InvalidRepoNameError> {
  const path = url
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
    .replace(/^[^/:]+@[^/:]+:/, '')
    .replace(/[/\\]+$/, '')
    .replace(/\.git$/, '')
  const segments = path.split(/[/\\:]/).filter(segment => segment !== '')
  const name = segments.at(-1)
  const owner = segments.at(-2)
  if (owner === undefined || name === undefined) {
    return Result.err(
      new InvalidRepoNameError({ value: url, message: `Cannot tell the owner and name of the repository at "${url}"` }),
    )
  }
  return Result.ok({ owner, name, url })
}
