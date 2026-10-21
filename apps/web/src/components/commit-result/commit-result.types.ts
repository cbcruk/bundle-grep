/**
 * Props for the commit result card.
 *
 * @module
 */

import type { Ref } from 'react'

import type { QuerySearch } from '../../lib/route.types'

import type { CommitResult as CommitEvent } from '../../hooks/use-search.types'

/** Props for {@linkcode CommitResult}. */
export interface CommitResultProps {
  /** The search the commit matched, kept when a file is opened. */
  from: QuerySearch
  /** The commit and its matching changes. */
  result: CommitEvent
  /** `true` when the keyboard cursor is on this commit. */
  selected: boolean
  /** The card's element, for scrolling it into view. */
  ref?: Ref<HTMLDivElement>
}
