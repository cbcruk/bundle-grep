/**
 * Lists repositories through the GitHub CLI, as targets to sync.
 *
 * @module
 */

import { Result } from 'better-result'

import { runProcess } from '../process/run-process'
import type { SyncTarget } from '../sync/sync.types'
import { GhError } from './github.errors'
import type { GithubOptions, ListGithubReposOptions } from './github.types'

const FIELDS = 'name,owner,url,isFork,isArchived,isPrivate,primaryLanguage,description,pushedAt'

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined
}

function toTarget(repo: unknown): SyncTarget | undefined {
  const owner = field(field(repo, 'owner'), 'login')
  const name = field(repo, 'name')
  const url = field(repo, 'url')
  if (typeof owner !== 'string' || typeof name !== 'string' || typeof url !== 'string') return undefined
  const language = field(field(repo, 'primaryLanguage'), 'name')
  const description = field(repo, 'description')
  const pushedAt = field(repo, 'pushedAt')
  return {
    owner,
    name,
    url,
    isFork: field(repo, 'isFork') === true,
    isArchived: field(repo, 'isArchived') === true,
    isPrivate: field(repo, 'isPrivate') === true,
    primaryLanguage: typeof language === 'string' && language !== '' ? language : null,
    description: typeof description === 'string' && description !== '' ? description : null,
    pushedAt: typeof pushedAt === 'string' && pushedAt !== '' ? pushedAt : null,
  }
}

async function runGhJson(args: string[], options: GithubOptions): Promise<Result<unknown, GhError>> {
  const result = await runProcess(options.gh ?? 'gh', args, { signal: options.signal })
  if (result.isErr()) {
    const { started, stderr, reason } = result.error
    return Result.err(
      new GhError({ args, stderr, message: started ? `gh ${args[0] ?? ''} ${reason}` : `Could not run gh: ${reason}` }),
    )
  }
  const parsed = Result.try(() => JSON.parse(result.value.stdout.toString('utf8')) as unknown)
  if (parsed.isErr()) return Result.err(new GhError({ args, stderr: '', message: 'gh printed output that is not JSON' }))
  return Result.ok(parsed.value)
}

function unexpected(args: string[]): GhError {
  return new GhError({ args, stderr: '', message: 'gh printed repositories in an unexpected shape' })
}

/**
 * Lists an account's repositories with the GitHub CLI.
 *
 * Needs `gh` to be installed and logged in. Forks and archived repositories
 * are included, so that `is:fork` and `is:archived` have something to find.
 *
 * @returns The repositories, or a {@linkcode GhError} when `gh` fails, prints
 * something other than a repository list, or the account has more
 * repositories than {@linkcode ListGithubReposOptions.limit}, so that none are
 * silently left out.
 *
 * @example Syncing every repository of an account
 * ```ts
 * import { listGithubRepos, syncRepos } from "@bundle-grep/core";
 *
 * const targets = (await listGithubRepos("cbcruk")).unwrap();
 * for await (const event of syncRepos(targets, { archiveDir: "archive", cacheDir: "cache" })) {
 *   console.log(event.type === "synced" ? event.outcome.status : event.error.message, event.target.name);
 * }
 * ```
 */
export async function listGithubRepos(
  owner: string,
  options: ListGithubReposOptions = {},
): Promise<Result<SyncTarget[], GhError>> {
  const limit = options.limit ?? 1000
  const args = ['repo', 'list', '--json', FIELDS, '--limit', String(limit + 1), '--', owner]
  const json = await runGhJson(args, options)
  return json.andThen(value => {
    if (!Array.isArray(value)) return Result.err(unexpected(args))
    if (value.length > limit) {
      return Result.err(
        new GhError({ args, stderr: '', message: `${owner} has more than ${limit} repositories; raise the limit` }),
      )
    }
    const targets = value.map(toTarget)
    return targets.every(target => target !== undefined) ? Result.ok(targets) : Result.err(unexpected(args))
  })
}

/**
 * Looks up one repository with the GitHub CLI.
 *
 * @param repo The repository as `owner/name`, or a URL `gh` accepts.
 * @returns The repository, or a {@linkcode GhError} when `gh` fails or
 * prints something other than a repository.
 */
export async function viewGithubRepo(repo: string, options: GithubOptions = {}): Promise<Result<SyncTarget, GhError>> {
  const args = ['repo', 'view', '--json', FIELDS, '--', repo]
  const json = await runGhJson(args, options)
  return json.andThen(value => {
    const target = toTarget(value)
    return target ? Result.ok(target) : Result.err(unexpected(args))
  })
}
