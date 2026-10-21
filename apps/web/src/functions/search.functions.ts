/**
 * The server function that runs a search.
 *
 * @module
 */

import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import type { SearchStreamEvent } from '../api/api.types'
import { parseSearchInput } from '../server/search-input'
import { searchStream } from '../server/search.server'
import { webConfig } from '../server/web-config.server'

/**
 * Streams a search's events as the search finds them.
 *
 * Called from a loader during server rendering, the stream is written into
 * the page as it arrives; called from the page, it is read over the wire.
 * Closing the request, or cancelling the stream, stops the search.
 */
export const searchArchive = createServerFn({ method: 'GET' })
  .validator(parseSearchInput)
  .handler(({ data }): ReadableStream<SearchStreamEvent> => searchStream(data, webConfig().layout, getRequest().signal))
