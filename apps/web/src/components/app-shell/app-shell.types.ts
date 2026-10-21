/**
 * Props for the page around every screen.
 *
 * @module
 */

import type { ReactNode } from 'react'

import type { CompletionSources } from '../../lib/complete.types'
import type { QuerySearch } from '../../lib/route.types'

/** Props for {@linkcode AppShell}. */
export interface AppShellProps {
  /** The search the address carries: the search box shows its query, and the repository list goes back to it. */
  from: QuerySearch
  /** Where completions come from. */
  sources: CompletionSources
  /** The screen. */
  children: ReactNode
}
