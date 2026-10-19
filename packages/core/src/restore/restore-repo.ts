/**
 * Restores the bare repositories that searches run on from archived bundles.
 *
 * @module
 */

import { Result } from 'better-result'
import { existsSync } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { ArchiveMismatchError } from '../archive/archive.errors'
import { archivePaths } from '../archive/archive-paths'
import type { ArchiveEntry } from '../archive/archive.types'
import { fileSystem } from '../archive/file-system'
import { readMetadata } from '../archive/metadata'
import type { GitError } from '../git/git.errors'
import type { GitOutput } from '../git/git.types'
import { branchesOf, chooseHead, refsDigest } from '../git/refs'
import { runGit } from '../git/run-git'
import type { RestoreError, RestoreEvent, RestoreOptions, RestoreOutcome } from './restore.types'

/** The refs sync keeps, and so the only ones restored. */
const KEPT_REFS = /^refs\/(heads|tags)\//

function refnameOf(line: string): string {
  return line.slice(line.indexOf(' ') + 1)
}

/** Sorts `<object> <refname>` lines by refname byte by byte, the order `for-each-ref` uses. */
function sortRefs(lines: readonly string[]): string {
  const sorted = [...lines].sort((a, b) => Buffer.compare(Buffer.from(refnameOf(a)), Buffer.from(refnameOf(b))))
  return sorted.map(line => `${line}\n`).join('')
}

function done(outcome: RestoreOutcome): Result<RestoreOutcome, never> {
  return Result.ok(outcome)
}

function lines(output: GitOutput): string[] {
  return output.stdout
    .toString('utf8')
    .split('\n')
    .filter(line => line !== '')
}

/**
 * Restores one repository's bare repository from its bundle, so it can be searched.
 *
 * The cache at `cacheDir/<owner>/<name>.git` is created when missing and
 * otherwise brought to exactly the bundle's branches and tags, the refs sync
 * keeps: ones the bundle lacks are deleted, and other refs in a bundle are
 * ignored. Nothing is fetched when the cache's refs and `HEAD` already match.
 * The cache is derived data, so deleting it and restoring again is always
 * safe; that is also the way to repair a cache whose objects were damaged,
 * since matching refs are all that is compared.
 *
 * When the metadata is present it is trusted over the bundle: the bundle must
 * hold exactly the refs and size it records, and `HEAD` is pointed at its
 * default branch; a mismatch fails before the cache is touched. Metadata that
 * records no `HEAD` means the repository had no branches when last synced, so
 * the result is `empty` and any cache of it is removed, even if an older
 * bundle is still beside it.
 *
 * Without metadata, as when only the bundle was copied over, `HEAD` points at
 * a branch on the commit the bundle's `HEAD` is on, preferring `main` and then
 * `master`; a bundle without branches is then an error, and the cache is left
 * alone. A bundle records no symbolic refs, so with several branches on
 * that commit this may not be the branch sync used; the files searched are
 * the same.
 *
 * @returns What restoring did, or the first failure. A corrupted bundle fails
 * with the {@linkcode GitError} of the fetch that reads it.
 *
 * @example Restoring a repository after deleting the cache
 * ```ts
 * import { restoreRepo } from "@bundle-grep/core";
 *
 * const outcome = await restoreRepo({ owner: "cbcruk", name: "barlo" }, { archiveDir: "archive", cacheDir: "cache" });
 * if (outcome.isOk()) console.log(outcome.value.status, outcome.value.paths.gitDir);
 * ```
 */
export function restoreRepo(
  repo: Pick<ArchiveEntry, 'owner' | 'name'>,
  options: RestoreOptions,
): Promise<Result<RestoreOutcome, RestoreError>> {
  return Result.gen(async function* () {
    const paths = yield* archivePaths(options, repo.owner, repo.name)
    const metadata = yield* Result.await(readMetadata(paths.metadata))
    const mismatch = (path: string, message: string): Result<never, ArchiveMismatchError> =>
      Result.err(new ArchiveMismatchError({ path, message }))
    const empty = async (): Promise<Result<RestoreOutcome, RestoreError>> => {
      const isRepository = existsSync(join(paths.gitDir, 'HEAD'))
      const removed = await fileSystem(paths.gitDir, () =>
        isRepository ? rm(paths.gitDir, { recursive: true, force: true }) : Promise.resolve(),
      )
      return removed.map(() => ({ status: 'empty', paths, defaultBranch: null, head: null }))
    }

    if (metadata?.head === null) return done(yield* Result.await(empty()))
    if (!existsSync(paths.bundle)) return mismatch(paths.bundle, `${paths.bundle} is missing`)

    const inArchive = (args: string[]): Promise<Result<GitOutput, GitError>> =>
      runGit(args, { cwd: dirname(paths.bundle), signal: options.signal })
    const listed = lines(yield* Result.await(inArchive(['bundle', 'list-heads', paths.bundle])))
    const bundleHead = listed.find(line => refnameOf(line) === 'HEAD')?.split(' ')[0]
    const bundleRefs = sortRefs(listed.filter(line => KEPT_REFS.test(refnameOf(line))))

    const defaultBranch =
      metadata?.defaultBranch ??
      chooseHead(
        null,
        listed.flatMap(line => (line.startsWith(`${bundleHead} refs/heads/`) ? branchesOf(line) : [])),
      ) ??
      chooseHead(null, branchesOf(bundleRefs))
    if (defaultBranch === undefined) return mismatch(paths.bundle, `${paths.bundle} holds no branches to restore`)
    const symref = `refs/heads/${defaultBranch}`

    if (metadata) {
      const { size } = yield* Result.await(fileSystem(paths.bundle, () => stat(paths.bundle)))
      if (refsDigest(bundleRefs, symref) !== metadata.refsDigest || size !== metadata.bundleSize) {
        return mismatch(paths.bundle, `${paths.bundle} does not hold what ${paths.metadata} records; sync it again`)
      }
    }

    const git = (args: string[], allowExitCodes?: number[]): Promise<Result<GitOutput, GitError>> =>
      runGit(args, { cwd: paths.gitDir, signal: options.signal, allowExitCodes })
    const resolveHead = async (): Promise<Result<string | undefined, GitError>> => {
      const resolved = await git(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], [1])
      return resolved.map(output => (output.exitCode === 0 ? output.stdout.toString('utf8').trim() : undefined))
    }

    const cached = existsSync(join(paths.gitDir, 'HEAD'))
    if (cached) {
      const refs = yield* Result.await(git(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads', 'refs/tags']))
      const head = (yield* Result.await(git(['symbolic-ref', '--quiet', 'HEAD'], [1]))).stdout.toString('utf8').trim()
      if (refs.stdout.toString('utf8') === bundleRefs && head === symref) {
        const resolved = yield* Result.await(resolveHead())
        if (resolved !== undefined) return done({ status: 'unchanged', paths, defaultBranch, head: resolved })
      }
    }

    yield* Result.await(fileSystem(paths.gitDir, () => mkdir(paths.gitDir, { recursive: true })))
    yield* Result.await(git(['init', '--quiet', '--bare', '.']))
    yield* Result.await(
      git([
        'fetch',
        '--quiet',
        '--prune',
        '--no-tags',
        '--',
        paths.bundle,
        '+refs/heads/*:refs/heads/*',
        '+refs/tags/*:refs/tags/*',
      ]),
    )
    yield* Result.await(git(['symbolic-ref', 'HEAD', symref]))
    const head = yield* Result.await(resolveHead())
    if (head === undefined) return mismatch(paths.gitDir, `${paths.gitDir} has no commit at ${symref}`)
    return done({ status: cached ? 'updated' : 'created', paths, defaultBranch, head })
  })
}

/**
 * Restores repositories one after another, yielding each one's outcome as it finishes.
 *
 * A repository that fails yields a `failed` event and the rest carry on.
 * Aborting {@linkcode RestoreOptions.signal} stops after the repository in
 * progress, which fails.
 */
export async function* restoreRepos(
  entries: Iterable<ArchiveEntry>,
  options: RestoreOptions,
): AsyncGenerator<RestoreEvent, void, undefined> {
  for (const entry of entries) {
    if (options.signal?.aborted) return
    const outcome = await restoreRepo(entry, options)
    yield outcome.isOk()
      ? { type: 'restored', entry, outcome: outcome.value }
      : { type: 'failed', entry, error: outcome.error }
  }
}
