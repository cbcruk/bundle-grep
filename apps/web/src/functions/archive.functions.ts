/**
 * Server functions that read what the archive holds.
 *
 * @module
 */

import { createServerFn } from '@tanstack/react-start'

import type { ArchiveIndex, Settings } from '../api/api.types'
import { archiveIndex, settingsOf } from '../server/archive.server'
import { webConfig } from '../server/web-config.server'

/** Lists the repositories, and the names `language:` and `symbol:` complete, for every screen. */
export const getArchiveIndex = createServerFn({ method: 'GET' }).handler(
  (): Promise<ArchiveIndex> => archiveIndex(webConfig().layout),
)

/** Reports where the archive lives. */
export const getSettings = createServerFn({ method: 'GET' }).handler((): Settings => settingsOf(webConfig()))
