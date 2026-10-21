/**
 * Groups results by repository, as GitHub lists them.
 *
 * @module
 */

/** Groups items by their `repo`, keeping repositories in first-seen order and items in order within each. */
export function groupByRepo<T extends { repo: string }>(items: readonly T[]): { repo: string; files: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const group = groups.get(item.repo)
    if (group) group.push(item)
    else groups.set(item.repo, [item])
  }
  return [...groups].map(([repo, files]) => ({ repo, files }))
}
