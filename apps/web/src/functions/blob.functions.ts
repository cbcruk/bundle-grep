/**
 * The server function that reads a file for the file view.
 *
 * @module
 */

import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import type { ApiResult, BlobContent } from '../api/api.types'
import { readFileContent } from '../server/blob.server'
import { parseBlobInput } from '../server/search-input'
import { webConfig } from '../server/web-config.server'

/** Reads a file at a commit, or at `HEAD`, as lines or as a binary file's size. */
export const getFile = createServerFn({ method: 'GET' })
  .validator(parseBlobInput)
  .handler(({ data }): Promise<ApiResult<BlobContent>> => readFileContent(data, webConfig().layout, getRequest().signal))
