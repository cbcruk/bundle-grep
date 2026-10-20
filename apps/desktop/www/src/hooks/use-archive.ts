/**
 * Loads what the archive holds, for the repository list and completions.
 *
 * @module
 */

import { useCallback, useEffect, useState } from 'react'

import type { ApiResult } from '../api/api.types'
import { listLanguages, listRepos, listSymbolLanguages } from '../api/load-archive'
import type { RepoList } from '../../../src/desktop.types'
import type { ArchiveState } from './use-archive.types'

/** The archived repositories, `undefined` while loading, and a way to load them again after a sync. */
export function useArchive(): ArchiveState {
  const [repos, setRepos] = useState<ApiResult<RepoList>>()
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let current = true
    void listRepos().then(result => {
      if (current) setRepos(result)
    })
    return (): void => {
      current = false
    }
  }, [generation])

  const reload = useCallback(() => setGeneration(n => n + 1), [])
  return { repos, reload }
}

function useNames(load: () => Promise<ApiResult<string[]>>): string[] {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    void load().then(result => {
      if (result.ok) setNames(result.value)
    })
  }, [load])
  return names
}

/** The names `language:` accepts, or `[]` until they load. */
export function useLanguages(): string[] {
  return useNames(listLanguages)
}

/** The languages `symbol:` finds definitions in, or `[]` until they load. */
export function useSymbolLanguages(): string[] {
  return useNames(listSymbolLanguages)
}
