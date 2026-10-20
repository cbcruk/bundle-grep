/**
 * Props for the commit result card.
 *
 * @module
 */

import type { Ref } from 'react'

import type { CommitResult as CommitEvent } from '../../hooks/use-search.types'

/** Props for {@linkcode CommitResult}. */
export interface CommitResultProps {
  /** The query the commit matched, kept when a file is opened. */
  query: string
  /** The commit and its matching changes. */
  result: CommitEvent
  /** `true` when the keyboard cursor is on this commit. */
  selected: boolean
  /** The card's element, for scrolling it into view. */
  ref?: Ref<HTMLElement>
}
