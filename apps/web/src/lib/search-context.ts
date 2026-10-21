/**
 * Shares the running search with the screens under it.
 *
 * @module
 */

import { createContext } from 'react'

import type { SearchState } from '../hooks/use-search.types'
import { IDLE } from '../hooks/use-search.utils'

/** The search for the address's query, for the results and the file opened from them. */
export const SearchContext = createContext<SearchState>(IDLE)
