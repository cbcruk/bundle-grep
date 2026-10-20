/**
 * Builds throwaway git repositories and bundles for tests.
 *
 * Git runs with the user's global and system config ignored, a fixed identity,
 * and fixed dates, so commit hashes are reproducible and a local signing or
 * hook setup cannot leak into a test.
 *
 * @module
 */

import { afterAll, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** One commit to create, as the files it writes. */
export interface FixtureCommit {
  /** The commit message. */
  message: string
  /** Paths to write, relative to the repository root, and their contents. `null` deletes the path. */
  files: Record<string, string | null>
}

/** A repository built by {@linkcode createFixtureRepo}, removed on dispose. */
export interface FixtureRepo extends Disposable {
  /** The temporary directory holding everything below. */
  root: string
  /** The working repository the commits were made in. */
  repo: string
  /** A bundle of the repository's complete history; not created when there are no commits. */
  bundle: string
  /** Runs git in the working repository and returns its trimmed stdout. */
  git(...args: string[]): string
}

const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
}

/**
 * Makes git run by the code under test ignore the user's global and system config for the current test file.
 *
 * Code under test inherits `process.env`, unlike {@linkcode runGit}, so a
 * developer's `url.*.insteadOf` or `init.defaultBranch` could otherwise change
 * its results.
 */
export function isolateGitConfig(): void {
  const isolated = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
  const saved = Object.fromEntries(Object.keys(isolated).map(key => [key, process.env[key]]))
  beforeAll(() => Object.assign(process.env, isolated))
  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
}

/**
 * Runs git with the isolated fixture environment.
 *
 * @returns The command's stdout with surrounding whitespace removed.
 */
export function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/**
 * Creates a repository from a list of commits and bundles its history.
 *
 * @example Building a two-commit repository
 * ```ts
 * import { createFixtureRepo } from "./fixture";
 *
 * using fixture = createFixtureRepo([
 *   { message: "init", files: { "src/a.ts": "export const a = 1\n" } },
 *   { message: "remove a", files: { "src/a.ts": null } },
 * ]);
 *
 * fixture.git("log", "--oneline");
 * ```
 */
export function createFixtureRepo(commits: FixtureCommit[]): FixtureRepo {
  const root = mkdtempSync(join(tmpdir(), 'bundle-grep-fixture-'))
  const repo = join(root, 'repo')
  const bundle = join(root, 'repo.bundle')

  mkdirSync(repo)
  runGit(repo, ['init', '--quiet', '--initial-branch=main'])

  for (const commit of commits) {
    for (const [path, contents] of Object.entries(commit.files)) {
      const target = join(repo, path)
      if (contents === null) {
        rmSync(target)
        continue
      }
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, contents)
    }
    runGit(repo, ['add', '--all'])
    runGit(repo, ['commit', '--quiet', '--message', commit.message])
  }

  if (commits.length > 0) runGit(repo, ['bundle', 'create', bundle, '--all'])

  return {
    root,
    repo,
    bundle,
    git: (...args) => runGit(repo, args),
    [Symbol.dispose]: () => rmSync(root, { recursive: true, force: true }),
  }
}
