/**
 * Restores the bare repositories that searches run on from archived bundles.
 *
 * @module
 */

import { Result } from 'better-result'
import { existsSync } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
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
 * otherwise brought to exactly the bundle's refs: refs the bundle lacks are
 * deleted. Nothing is fetched when the cache already matches. The cache is
 * derived data, so deleting it and restoring again is always safe.
 *
 * When the metadata is present, the bundle must hold exactly the refs and
 * size it records, and `HEAD` is pointed at its default branch; a mismatch
 * fails before the cache is touched. Without metadata, as when only the
 * bundle was copied over, `HEAD` points at the branch the bundle's `HEAD`
 * matches, preferring `main` and then `master`.
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
    const mismatch = (message: string): Result<never, ArchiveMismatchError> =>
      Result.err(new ArchiveMismatchError({ path: paths.bundle, message }))

    if (!existsSync(paths.bundle)) {
      if (metadata?.head === null) return done({ status: 'empty', paths, defaultBranch: null, head: null })
      return mismatch(`${paths.bundle} is missing`)
    }
    if (metadata?.head === null) {
      return mismatch(`${paths.metadata} records an empty repository, but ${paths.bundle} exists; sync it again`)
    }

    const inArchive = (args: string[]): Promise<Result<GitOutput, GitError>> =>
      runGit(args, { cwd: dirname(paths.bundle), signal: options.signal })
    const listed = lines(yield* Result.await(inArchive(['bundle', 'list-heads', paths.bundle])))
    const bundleHead = listed.find(line => refnameOf(line) === 'HEAD')?.split(' ')[0]
    const bundleRefs = sortRefs(listed.filter(line => refnameOf(line) !== 'HEAD'))

    const defaultBranch =
      metadata?.defaultBranch ??
      chooseHead(
        null,
        listed.flatMap(line => (line.startsWith(`${bundleHead} refs/heads/`) ? branchesOf(line) : [])),
      ) ??
      chooseHead(null, branchesOf(bundleRefs))
    if (defaultBranch === undefined) return mismatch(`${paths.bundle} holds no branches`)
    const symref = `refs/heads/${defaultBranch}`

    if (metadata) {
      const { size } = yield* Result.await(fileSystem(paths.bundle, () => stat(paths.bundle)))
      if (refsDigest(bundleRefs, symref) !== metadata.refsDigest || size !== metadata.bundleSize) {
        return mismatch(`${paths.bundle} does not hold what ${paths.metadata} records; sync it again`)
      }
    }

    const git = (args: string[], allowExitCodes?: number[]): Promise<Result<GitOutput, GitError>> =>
      runGit(args, { cwd: paths.gitDir, signal: options.signal, allowExitCodes })
    const cached = existsSync(join(paths.gitDir, 'HEAD'))
    if (cached) {
      const refs = (yield* Result.await(git(['for-each-ref', '--format=%(objectname) %(refname)']))).stdout
      const head = (yield* Result.await(git(['symbolic-ref', '--quiet', 'HEAD'], [1]))).stdout.toString('utf8').trim()
      if (refs.toString('utf8') === bundleRefs && head === symref) {
        const resolved = yield* Result.await(git(['rev-parse', '--verify', 'HEAD^{commit}']))
        return done({ status: 'unchanged', paths, defaultBranch, head: resolved.stdout.toString('utf8').trim() })
      }
    }

    yield* Result.await(fileSystem(paths.gitDir, () => mkdir(paths.gitDir, { recursive: true })))
    yield* Result.await(git(['init', '--quiet', '--bare', '.']))
    yield* Result.await(git(['fetch', '--quiet', '--prune', '--no-tags', '--', paths.bundle, '+refs/*:refs/*']))
    yield* Result.await(git(['symbolic-ref', 'HEAD', symref]))
    const head = (yield* Result.await(git(['rev-parse', '--verify', 'HEAD^{commit}']))).stdout.toString('utf8').trim()
    if (metadata && head !== metadata.head) {
      return mismatch(`${paths.gitDir} resolves HEAD to ${head}, but ${paths.metadata} records ${metadata.head}`)
    }
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
