/**
 * Props for the result card and its code lines.
 *
 * @module
 */

import type { Ref } from 'react'

import type { FileResult as FileEvent } from '../../hooks/use-search.types'
import type { Segment } from '../../lib/highlight.types'
import type { QuerySearch, Route } from '../../lib/route.types'

/** Props for {@linkcode FileResult}. */
export interface FileResultProps {
  /** The search the file matched, kept when the file is opened. */
  from: QuerySearch
  /** The file. */
  file: FileEvent
  /** `true` when the keyboard cursor is on this file. */
  selected: boolean
  /** The card's element, for scrolling it into view. */
  ref?: Ref<HTMLDivElement>
}

/** Props for {@linkcode CodeLine}. */
export interface CodeLineProps {
  /** The 1-based line number. */
  number: number
  /** Where the line number links to. */
  to: Route
  /** Replaces the history entry when the link is followed, as moving within one file does. */
  replace?: boolean
  /** The line's text, split into plain and highlighted runs. */
  segments: Segment[]
  /** `true` for a line shown only as context around a match, which is dimmed. */
  context: boolean
  /** In a commit: whether the commit added the line or removed it, shown with a `+` or `-`. */
  change?: 'added' | 'removed'
  /** In the file view: `true` for the line the address names. */
  marked?: boolean
  /** The row's element id, for scrolling to it. */
  id?: string
}
