/**
 * Loads what the archive holds, for the repository list and completions.
 *
 * @module
 */

import { useCallback, useEffect, useState } from 'react'

import type { BridgeResult } from '../api/api.types'
import { bridge } from '../api/bridge'
import type { RepoList } from '../../../src/desktop.types'

/** The archived repositories, `undefined` while loading, and a way to load them again after a sync. */
export function useArchive(): { repos: BridgeResult<RepoList> | undefined; reload: () => void } {
  const [repos, setRepos] = useState<BridgeResult<RepoList>>()
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let current = true
    void bridge()
      .bundleGrepListRepos()
      .then(result => {
        if (current) setRepos(result)
      })
    return (): void => {
      current = false
    }
  }, [generation])

  const reload = useCallback(() => setGeneration(n => n + 1), [])
  return { repos, reload }
}

/** The names `language:` accepts, or `[]` until they load. */
export function useLanguages(): string[] {
  const [languages, setLanguages] = useState<string[]>([])
  useEffect(() => {
    void bridge()
      .bundleGrepLanguages()
      .then(result => {
        if (result.ok) setLanguages(result.value)
      })
  }, [])
  return languages
}
