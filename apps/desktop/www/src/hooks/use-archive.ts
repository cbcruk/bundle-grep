/**
 * Loads what the archive holds, for the repository list and completions.
 *
 * @module
 */

import { useCallback, useEffect, useState } from 'react'

import type { BridgeResult } from '../api/api.types'
import { bridge } from '../api/bridge'
import type { RepoList } from '../../../src/desktop.types'
import type { ArchiveState } from './use-archive.types'

/** The archived repositories, `undefined` while loading, and a way to load them again after a sync. */
export function useArchive(): ArchiveState {
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

function useNames(load: () => Promise<BridgeResult<string[]>>): string[] {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    void load().then(result => {
      if (result.ok) setNames(result.value)
    })
  }, [load])
  return names
}

const loadLanguages = (): Promise<BridgeResult<string[]>> => bridge().bundleGrepLanguages()

const loadSymbolLanguages = (): Promise<BridgeResult<string[]>> => bridge().bundleGrepSymbolLanguages()

/** The names `language:` accepts, or `[]` until they load. */
export function useLanguages(): string[] {
  return useNames(loadLanguages)
}

/** The languages `symbol:` finds definitions in, or `[]` until they load. */
export function useSymbolLanguages(): string[] {
  return useNames(loadSymbolLanguages)
}
