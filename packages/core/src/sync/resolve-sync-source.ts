/**
 * Turns what a user names to sync into {@linkcode SyncTarget}s.
 *
 * @module
 */

import { Result } from 'better-result'
import { resolve } from 'node:path'

import { listGithubRepos, viewGithubRepo } from '../github/github-repos'
import { expandHome } from './expand-home'
import type { ResolvedSource, ResolveSyncSourceOptions, SourceError, SyncTarget } from './sync.types'
import { targetFromUrl } from './target-from-url'

const LOCAL_PATH = /^(?:\.{1,2}(?:\/|$)|\/|~(?:\/|$))/
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\/|^[^/\s]+:/i
const GITHUB = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)/i

/**
 * Turns one sync source into the repositories it names.
 *
 * A source is, in the order tried: a git URL; a local path starting with
 * `/`, `./`, `../` or `~/`; an `owner/name` on GitHub; or a GitHub owner,
 * meaning every repository of that user or organisation.
 *
 * A GitHub URL is looked up with `gh` so that `is:fork` and `is:archived`
 * work, but keeps the URL as given, so an SSH URL is still fetched over SSH;
 * when `gh` cannot help, the repository is synced anyway with a warning.
 * Local paths are made absolute against the working directory, as git runs
 * them from the cache directory.
 *
 * @example Resolving an owner
 * ```ts
 * import { resolveSyncSource } from "@bundle-grep/core";
 *
 * const resolved = await resolveSyncSource("cbcruk", { limit: 100 });
 *
 * if (resolved.isOk()) console.log(resolved.value.targets.length);
 * ```
 */
export async function resolveSyncSource(
  source: string,
  options: ResolveSyncSourceOptions = {},
): Promise<Result<ResolvedSource, SourceError>> {
  const github = { gh: options.gh, signal: options.signal }
  const one = (target: SyncTarget, warning?: string): ResolvedSource => ({ targets: [target], ...(warning ? { warning } : {}) })

  if (URL_LIKE.test(source)) {
    const parsed = targetFromUrl(source)
    if (parsed.isErr() || !GITHUB.test(parsed.value.url)) return parsed.map(target => one(target))
    const target = parsed.value
    const viewed = await viewGithubRepo(`${target.owner}/${target.name}`, github)
    if (viewed.isOk()) return Result.ok(one({ ...viewed.value, url: target.url }))
    return Result.ok(one(target, `could not look ${target.owner}/${target.name} up with gh, so whether it is a fork or archived is unknown: ${viewed.error.message}`))
  }
  if (LOCAL_PATH.test(source)) {
    return targetFromUrl(resolve(expandHome(source))).map(target => one(target))
  }
  if (source.includes('/')) return (await viewGithubRepo(source, github)).map(target => one(target))
  return (await listGithubRepos(source, { ...github, limit: options.limit })).map(targets => ({ targets }))
}
