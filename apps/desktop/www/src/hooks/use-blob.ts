/**
 * Loads a file for the file view.
 *
 * @module
 */

import { useEffect, useState } from 'react'

import { fetchBlob } from '../api/fetch-blob'
import { blobLines } from '../lib/blob-text'
import type { BlobState } from './use-blob.types'

/** Fetches a file at `HEAD` and splits it into lines, abandoning the request if the file changes first. */
export function useBlob(repo: string, path: string): BlobState {
  const [state, setState] = useState<BlobState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    void fetchBlob(repo, path, controller.signal).then(result => {
      if (controller.signal.aborted) return
      if (!result.ok) return setState({ status: 'error', error: result.error })
      const lines = blobLines(result.value)
      setState(lines ? { status: 'text', lines } : { status: 'binary', size: result.value.byteLength })
    })
    return (): void => controller.abort()
  }, [repo, path])

  return state
}
