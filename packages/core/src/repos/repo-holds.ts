/**
 * Decides repository qualifiers from what the archive knows about a repository.
 *
 * @module
 */

import type { FilterLeaf } from '../plan/plan.types'
import type { ArchivedRepo } from './repos.types'

/**
 * Says whether a repository qualifier holds for an archived repository.
 *
 * - `repo:owner/name` holds for that one repository.
 * - `org:owner` and `user:owner` hold for every repository of that owner;
 *   both look at the same owner, as the archive does not tell them apart.
 * - `is:fork` and `is:archived` read the synced metadata. A repository
 *   archived without metadata is neither.
 *
 * Owners and names compare case-insensitively, as on GitHub. Negation and
 * `OR` are the plan's business, so `-is:fork` and `repo:a/b OR repo:c/d`
 * need nothing more.
 *
 * @example Searching only one owner's original repositories
 * ```ts
 * import { compileQuery, loadArchivedRepos, parseQuery, repoHolds, search } from "@bundle-grep/core";
 *
 * const plan = parseQuery("useState org:cbcruk -is:fork").andThen(compileQuery).unwrap();
 * const { repos } = (await loadArchivedRepos({ archiveDir: "archive", cacheDir: "cache" })).unwrap();
 *
 * for await (const event of search({ plan, repos, holds: repoHolds })) {
 *   if (event.type === "file") console.log(`${event.repo}/${event.path}`);
 * }
 * ```
 */
export function repoHolds(repo: ArchivedRepo, filter: FilterLeaf): boolean {
  const value = filter.value.toLowerCase()
  switch (filter.key) {
    case 'repo':
      return value === `${repo.entry.owner}/${repo.entry.name}`.toLowerCase()
    case 'org':
    case 'user':
      return value === repo.entry.owner.toLowerCase()
    case 'is':
      if (value === 'fork') return repo.metadata?.isFork ?? false
      if (value === 'archived') return repo.metadata?.isArchived ?? false
      return false
    case 'language':
      return true
  }
}
