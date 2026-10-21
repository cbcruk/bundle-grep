/**
 * Formatting for the repository list.
 *
 * @module
 */

import type { RepoRow, RestoreItem, SyncItem } from '../../api/api.types'

/** How each repository state is labelled. */
export const STATE_LABEL: Record<RepoRow['state'], string> = {
  ready: 'Ready',
  unrestored: 'Needs restore',
  empty: 'Empty',
}

/** Writes an ISO 8601 time in the viewer's locale, or `—` when unknown. */
export function date(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

/** Says what happened to one source or repository in a sync or restore. */
export function itemText(item: SyncItem | RestoreItem): { subject: string; text: string; failed: boolean } {
  switch (item.type) {
    case 'synced':
      return { subject: item.repo, text: item.status, failed: false }
    case 'restored':
      return { subject: item.repo, text: item.status, failed: false }
    case 'warning':
      return { subject: item.source, text: item.message, failed: false }
    case 'failed':
      return { subject: item.subject, text: item.error.message, failed: true }
  }
}
