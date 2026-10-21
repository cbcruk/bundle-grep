/**
 * Props for the page around every screen.
 *
 * @module
 */

import type { ReactNode } from 'react'

import type { CompletionSources } from '../../lib/complete.types'

/** Props for {@linkcode AppShell}. */
export interface AppShellProps {
  /** The query the address carries, which the search box shows. */
  query: string
  /** Where completions come from. */
  sources: CompletionSources
  /** The screen. */
  children: ReactNode
}
