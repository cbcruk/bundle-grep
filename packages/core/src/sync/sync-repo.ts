/**
 * Fetches repositories into bare mirrors and archives them as bundles.
 *
 * @module
 */

import { Result } from 'better-result'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { archivePaths } from '../archive/archive-paths'
import type { ArchivePaths, RepoMetadata } from '../archive/archive.types'
import { fileSystem } from '../archive/file-system'
import { readMetadata, writeMetadata } from '../archive/metadata'
import { acquireRepoLock } from '../archive/repo-lock'
import type { GitError } from '../git/git.errors'
import type { GitOutput } from '../git/git.types'
import { branchesOf, chooseHead, parseRemoteRefs, refsDigest } from '../git/refs'
import { runGit } from '../git/run-git'
import { symbolIndex } from '../symbols/symbol-index'
import type { SyncError, SyncEvent, SyncOptions, SyncOutcome, SyncReposOptions, SyncStatus, SyncTarget } from './sync.types'

/** How old a leftover temporary bundle must be before it counts as abandoned. */
const ABANDONED_AFTER_MS = 60 * 60 * 1000

// The empty value clears the user's helpers for github.com, as `gh auth
// setup-git` does, so gh's token is neither shadowed by nor stored into them.
const GITHUB_CREDENTIALS = [
  '-c',
  'credential.https://github.com.helper=',
  '-c',
  'credential.https://github.com.helper=!gh auth git-credential',
]

function withoutCredentials(url: string): string {
  return url.replace(/^(https?:\/\/)[^/@]*@/i, '$1')
}

/**
 * Syncs one repository: fetches it into its bare mirror and rebuilds its bundle when its refs changed.
 *
 * The mirror at `cacheDir/<owner>/<name>.git` is created on first use and
 * holds every branch and tag; branches and tags deleted upstream are deleted
 * from it, and so from the next bundle. Pull request refs are left out. The
 * remote's refs are listed first, and the fetch is skipped when the mirror
 * already holds exactly those, which saves a round trip for an unchanged
 * repository.
 * `HEAD` follows the remote's default branch; when the remote does not name
 * one that exists, it falls back to `main`, `master`, or the first branch.
 *
 * The bundle is rebuilt only when a digest of the refs differs from the one
 * in the existing metadata, or when the bundle on disk no longer holds those
 * refs or has changed size. It is written to a file of its own beside its
 * destination, checked with `git bundle verify`, and renamed into place, so an
 * interrupted sync leaves the previous bundle intact; temporary files an
 * interrupted sync left behind are removed once they are an hour old.
 * `verify` reads only the header and checks prerequisites; it does not prove
 * the pack data is intact. The metadata is rewritten on every sync, so fork
 * and archived flags stay current even when the code has not changed. Last,
 * the symbol index of the default branch is brought up to date with
 * {@linkcode symbolIndex}; if that fails, the next search builds it.
 *
 * While it runs, the sync holds the lock file `cacheDir/<owner>/<name>.git.lock`;
 * a second sync or a restore of the same repository fails with
 * {@linkcode RepoLockedError} instead of racing the first.
 *
 * For `https://github.com/` URLs, git can fall back to `gh` for credentials,
 * replacing the user's own helpers for github.com, so private repositories
 * work once `gh` is logged in. Git never prompts. Credentials in an HTTP(S)
 * URL are used to fetch but left out of the metadata.
 *
 * @returns What the sync did, or the first failure. A repository without
 * commits is not an error: it is synced as `empty`, with no bundle written
 * and any earlier bundle left in place.
 *
 * @example Syncing a repository by URL
 * ```ts
 * import { syncRepo, targetFromUrl } from "@bundle-grep/core";
 *
 * const target = targetFromUrl("https://github.com/cbcruk/barlo").unwrap();
 * const outcome = await syncRepo(target, { archiveDir: "archive", cacheDir: "cache" });
 * if (outcome.isOk()) console.log(outcome.value.status, outcome.value.paths.bundle);
 * ```
 */
export function syncRepo(target: SyncTarget, options: SyncOptions): Promise<Result<SyncOutcome, SyncError>> {
  const { url } = target
  const credentials = url.startsWith('https://github.com/') ? GITHUB_CREDENTIALS : []

  return Result.gen(async function* () {
    const paths = yield* archivePaths(options, target.owner, target.name)
    const git = (args: string[], allowExitCodes?: number[]): Promise<Result<GitOutput, GitError>> =>
      runGit(args, { cwd: paths.gitDir, env: { ...options.env, GIT_TERMINAL_PROMPT: '0' }, signal: options.signal, allowExitCodes })

    await using _lock = yield* Result.await(acquireRepoLock(`${paths.gitDir}.lock`))
    yield* Result.await(fileSystem(paths.gitDir, () => mkdir(paths.gitDir, { recursive: true })))
    yield* Result.await(git(['init', '--quiet', '--bare', '.']))
    const remote = parseRemoteRefs((yield* Result.await(git([...credentials, 'ls-remote', '--symref', '--', url]))).stdout.toString('utf8'))
    const mirrored = (yield* Result.await(git(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads', 'refs/tags']))).stdout
    if (!sameRefs(mirrored.toString('utf8'), remote.refs)) {
      yield* Result.await(
        git([
          ...credentials,
          'fetch',
          '--quiet',
          '--prune',
          '--no-tags',
          '--',
          url,
          '+refs/heads/*:refs/heads/*',
          '+refs/tags/*:refs/tags/*',
        ]),
      )
    }
    const remoteHead = remote.head
    const refs = (yield* Result.await(git(['for-each-ref', '--format=%(objectname) %(refname)']))).stdout
    const headBranch = chooseHead(remoteHead, branchesOf(refs.toString('utf8')))
    if (headBranch !== undefined) yield* Result.await(git(['symbolic-ref', 'HEAD', `refs/heads/${headBranch}`]))

    const symref = (yield* Result.await(git(['symbolic-ref', '--quiet', 'HEAD'], [1]))).stdout.toString('utf8').trim()
    const resolved = yield* Result.await(git(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], [1]))
    const head = resolved.exitCode === 0 ? resolved.stdout.toString('utf8').trim() : null
    const digest = refsDigest(refs, symref)

    const previous = (await readMetadata(paths.metadata)).unwrapOr(undefined)
    const existingSize = existsSync(paths.bundle)
      ? (yield* Result.await(fileSystem(paths.bundle, () => stat(paths.bundle)))).size
      : undefined
    const status: SyncStatus =
      refs.length === 0
        ? 'empty'
        : existingSize === undefined
          ? 'created'
          : previous?.refsDigest === digest &&
              previous.bundleSize === existingSize &&
              (await bundleHolds(paths.bundle, refs, git))
            ? 'unchanged'
            : 'updated'

    const bundleSize =
      status === 'empty'
        ? null
        : status === 'unchanged'
          ? (existingSize ?? null)
          : yield* Result.await(writeBundle(paths, git))

    const metadata: RepoMetadata = {
      version: 1,
      owner: target.owner,
      name: target.name,
      url: withoutCredentials(url),
      isFork: target.isFork ?? false,
      isArchived: target.isArchived ?? false,
      isPrivate: target.isPrivate ?? null,
      primaryLanguage: target.primaryLanguage ?? null,
      description: target.description ?? null,
      defaultBranch: head === null ? null : symref.replace(/^refs\/heads\//, ''),
      head,
      refsDigest: digest,
      bundleSize,
      pushedAt: target.pushedAt ?? null,
      syncedAt: (options.now?.() ?? new Date()).toISOString(),
    }
    yield* Result.await(writeMetadata(paths.metadata, metadata))
    if (head !== null) await symbolIndex(paths.gitDir, { signal: options.signal })
    return Result.ok({ status, paths, metadata })
  })
}

function sameRefs(mirrored: string, remote: readonly string[]): boolean {
  const lines = mirrored.split('\n').filter(line => line !== '')
  return lines.length === remote.length && lines.sort().every((line, index) => line === remote[index])
}

async function bundleHolds(
  bundle: string,
  refs: Buffer,
  git: (args: string[]) => Promise<Result<GitOutput, GitError>>,
): Promise<boolean> {
  const heads = await git(['bundle', 'list-heads', bundle])
  if (heads.isErr()) return false
  const listed = heads.value.stdout
    .toString('utf8')
    .split('\n')
    .filter(line => line !== '' && !line.endsWith(' HEAD'))
  const expected = refs.toString('utf8').split('\n').filter(line => line !== '')
  return listed.sort().join('\n') === expected.sort().join('\n')
}

async function removeAbandoned(bundle: string): Promise<void> {
  const prefix = `${basename(bundle)}.`
  const cutoff = Date.now() - ABANDONED_AFTER_MS
  for (const entry of await readdir(dirname(bundle))) {
    if (!entry.startsWith(prefix) || !/\.tmp(\.lock)?$/.test(entry)) continue
    const path = join(dirname(bundle), entry)
    const { mtimeMs } = await stat(path).catch(() => ({ mtimeMs: Infinity }))
    if (mtimeMs < cutoff) await rm(path, { force: true })
  }
}

async function writeBundle(
  paths: ArchivePaths,
  git: (args: string[]) => Promise<Result<GitOutput, GitError>>,
): Promise<Result<number, SyncError>> {
  // Unique per run, so neither a file left by a killed sync nor a sync running
  // alongside can block or clobber this one.
  const temporary = `${paths.bundle}.${randomUUID()}.tmp`
  const written = await Result.gen(async function* () {
    yield* Result.await(fileSystem(paths.bundle, () => mkdir(dirname(paths.bundle), { recursive: true })))
    yield* Result.await(fileSystem(paths.bundle, () => removeAbandoned(paths.bundle)))
    yield* Result.await(git(['bundle', 'create', '--quiet', temporary, '--all']))
    yield* Result.await(git(['bundle', 'verify', '--quiet', temporary]))
    const { size } = yield* Result.await(fileSystem(temporary, () => stat(temporary)))
    yield* Result.await(fileSystem(paths.bundle, () => rename(temporary, paths.bundle)))
    return Result.ok(size)
  })
  if (written.isErr()) await rm(temporary, { force: true }).catch(() => undefined)
  return written
}

/** How many repositories {@linkcode syncRepos} syncs at once by default; each mostly waits on the network. */
export const DEFAULT_SYNC_CONCURRENCY = 8

/**
 * Syncs repositories, several at a time, yielding each one's outcome in the order given.
 *
 * The targets are read up front. Up to
 * {@linkcode SyncReposOptions.concurrency} repositories sync at once, and an
 * outcome is yielded once every repository before it has been. A repository
 * that fails yields a `failed` event and the rest carry on. Aborting
 * {@linkcode SyncOptions.signal} starts no more repositories; those in
 * progress fail, and their events are still yielded. Leaving the loop early
 * also starts no more, and waits for those in progress to finish.
 */
export async function* syncRepos(
  targets: Iterable<SyncTarget>,
  options: SyncReposOptions,
): AsyncGenerator<SyncEvent, void, undefined> {
  const queue = [...targets]
  const requested = options.concurrency ?? DEFAULT_SYNC_CONCURRENCY
  const concurrency = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : DEFAULT_SYNC_CONCURRENCY
  let stopped = false
  const events: Promise<SyncEvent>[] = []
  let started = 0
  let running = 0
  let wake: (() => void) | undefined

  const run = async (target: SyncTarget): Promise<SyncEvent> => {
    try {
      const outcome = await syncRepo(target, options)
      return outcome.isOk()
        ? { type: 'synced', target, outcome: outcome.value }
        : { type: 'failed', target, error: outcome.error }
    } finally {
      running--
      start()
      wake?.()
    }
  }
  const start = (): void => {
    while (!stopped && running < concurrency && started < queue.length && !options.signal?.aborted) {
      running++
      const event = run(queue[started++]!)
      event.catch(() => undefined)
      events.push(event)
    }
  }

  start()
  try {
    for (let index = 0; index < queue.length; index++) {
      while (index >= events.length) {
        if (running === 0) return
        await new Promise<void>(resolve => (wake = resolve))
      }
      yield await events[index]!
    }
  } finally {
    stopped = true
    await Promise.allSettled(events)
  }
}
