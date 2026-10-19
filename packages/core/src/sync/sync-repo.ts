/**
 * Fetches repositories into bare mirrors and archives them as bundles.
 *
 * @module
 */

import { Result } from 'better-result'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

import { FileSystemError } from '../archive/archive.errors'
import { archivePaths } from '../archive/archive-paths'
import type { ArchivePaths, RepoMetadata } from '../archive/archive.types'
import { readMetadata, writeMetadata } from '../archive/metadata'
import type { GitError } from '../git/git.errors'
import type { GitOutput } from '../git/git.types'
import { runGit } from '../git/run-git'
import type { SyncError, SyncEvent, SyncOptions, SyncOutcome, SyncStatus, SyncTarget } from './sync.types'

// The empty value clears the user's helpers for github.com, as `gh auth
// setup-git` does, so gh's token is neither shadowed by nor stored into them.
const GITHUB_CREDENTIALS = [
  '-c',
  'credential.https://github.com.helper=',
  '-c',
  'credential.https://github.com.helper=!gh auth git-credential',
]

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function fileSystem<T>(path: string, run: () => Promise<T>): Promise<Result<T, FileSystemError>> {
  return Result.tryPromise({
    try: run,
    catch: cause => new FileSystemError({ path, message: `Could not update ${path}: ${describe(cause)}` }),
  })
}

function parseSymref(output: GitOutput): string | null {
  const match = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(output.stdout.toString('utf8'))
  return match?.[1] ?? null
}

function branchesOf(refs: string): string[] {
  return refs.split('\n').flatMap(line => {
    const ref = line.slice(line.indexOf(' ') + 1)
    return ref.startsWith('refs/heads/') ? [ref.slice('refs/heads/'.length)] : []
  })
}

function chooseHead(remoteHead: string | null, branches: readonly string[]): string | undefined {
  return [remoteHead, 'main', 'master', branches[0]].find(
    (branch): branch is string => branch !== null && branch !== undefined && branches.includes(branch),
  )
}

function withoutCredentials(url: string): string {
  return url.replace(/^(https?:\/\/)[^/@]*@/i, '$1')
}

/**
 * Syncs one repository: fetches it into its bare mirror and rebuilds its bundle when its refs changed.
 *
 * The mirror at `cacheDir/<owner>/<name>.git` is created on first use and
 * holds every branch and tag; branches and tags deleted upstream are deleted
 * from it, and so from the next bundle. Pull request refs are left out.
 * `HEAD` follows the remote's default branch; when the remote does not name
 * one that exists, it falls back to `main`, `master`, or the first branch.
 *
 * The bundle is rebuilt only when a digest of the refs differs from the one
 * in the existing metadata, or when the bundle on disk no longer holds those
 * refs or has changed size. It is written to a file of its own beside its
 * destination, checked with `git bundle verify`, and renamed into place, so an
 * interrupted sync leaves the previous bundle intact. `verify` reads only the
 * header and checks prerequisites; it does not prove the pack data is intact. The metadata is rewritten on every sync,
 * so fork and archived flags stay current even when the code has not changed.
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
      runGit(args, { cwd: paths.gitDir, env: { GIT_TERMINAL_PROMPT: '0' }, signal: options.signal, allowExitCodes })

    yield* Result.await(fileSystem(paths.gitDir, () => mkdir(paths.gitDir, { recursive: true })))
    yield* Result.await(git(['init', '--quiet', '--bare', '.']))
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
    const remoteHead = parseSymref(yield* Result.await(git([...credentials, 'ls-remote', '--symref', '--', url, 'HEAD'])))
    const refs = (yield* Result.await(git(['for-each-ref', '--format=%(objectname) %(refname)']))).stdout
    const headBranch = chooseHead(remoteHead, branchesOf(refs.toString('utf8')))
    if (headBranch !== undefined) yield* Result.await(git(['symbolic-ref', 'HEAD', `refs/heads/${headBranch}`]))

    const symref = (yield* Result.await(git(['symbolic-ref', '--quiet', 'HEAD'], [1]))).stdout.toString('utf8').trim()
    const resolved = yield* Result.await(git(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], [1]))
    const head = resolved.exitCode === 0 ? resolved.stdout.toString('utf8').trim() : null
    const refsDigest = createHash('sha256').update(refs).update(`HEAD ${symref}\n`).digest('hex')

    const previous = (await readMetadata(paths.metadata)).unwrapOr(undefined)
    const existingSize = existsSync(paths.bundle) ? (await stat(paths.bundle)).size : undefined
    const status: SyncStatus =
      refs.length === 0
        ? 'empty'
        : existingSize === undefined
          ? 'created'
          : previous?.refsDigest === refsDigest &&
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
      refsDigest,
      bundleSize,
      pushedAt: target.pushedAt ?? null,
      syncedAt: (options.now?.() ?? new Date()).toISOString(),
    }
    yield* Result.await(writeMetadata(paths.metadata, metadata))
    return Result.ok({ status, paths, metadata })
  })
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

async function writeBundle(
  paths: ArchivePaths,
  git: (args: string[]) => Promise<Result<GitOutput, GitError>>,
): Promise<Result<number, SyncError>> {
  // Unique per run, so neither a file left by a killed sync nor a sync running
  // alongside can block or clobber this one.
  const temporary = `${paths.bundle}.${randomUUID()}.tmp`
  const written = await Result.gen(async function* () {
    yield* Result.await(fileSystem(paths.bundle, () => mkdir(dirname(paths.bundle), { recursive: true })))
    yield* Result.await(git(['bundle', 'create', '--quiet', temporary, '--all']))
    yield* Result.await(git(['bundle', 'verify', '--quiet', temporary]))
    const { size } = yield* Result.await(fileSystem(temporary, () => stat(temporary)))
    yield* Result.await(fileSystem(paths.bundle, () => rename(temporary, paths.bundle)))
    return Result.ok(size)
  })
  if (written.isErr()) await rm(temporary, { force: true }).catch(() => undefined)
  return written
}

/**
 * Syncs repositories one after another, yielding each one's outcome as it finishes.
 *
 * A repository that fails yields a `failed` event and the rest carry on.
 * Aborting {@linkcode SyncOptions.signal} stops after the repository in
 * progress, which fails.
 */
export async function* syncRepos(
  targets: Iterable<SyncTarget>,
  options: SyncOptions,
): AsyncGenerator<SyncEvent, void, undefined> {
  for (const target of targets) {
    if (options.signal?.aborted) return
    const outcome = await syncRepo(target, options)
    yield outcome.isOk()
      ? { type: 'synced', target, outcome: outcome.value }
      : { type: 'failed', target, error: outcome.error }
  }
}
