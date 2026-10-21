import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { proportional, Table, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { RestoreItem, SyncItem, WireError } from '../../api/api.types'
import { runJob } from '../../api/run-job'
import { Link } from '../link/link'
import type { RepoTableRow, ReposViewProps } from './repos-view.types'
import { itemText, STATE_DOT, STATE_LABEL } from './repos-view.utils'

/** Shows an ISO 8601 time, or `—` when unknown. */
function When({ iso }: { iso: string | null | undefined }): React.JSX.Element {
  return iso ? <Timestamp value={iso} format="date_time" type="body" color="primary" /> : <Text color="secondary">—</Text>
}

const COLUMNS: TableColumn<RepoTableRow>[] = [
  {
    key: 'name',
    header: 'Repository',
    width: proportional(3, { minWidth: 240 }),
    renderCell: repo => (
      <VStack gap={0.5}>
        <Link to={{ view: 'search', q: `repo:${repo.name}` }}>{repo.name}</Link>
        {repo.metadata?.description && (
          <Text color="secondary" maxLines={2}>
            {repo.metadata.description}
          </Text>
        )}
      </VStack>
    ),
  },
  {
    key: 'state',
    header: 'State',
    width: proportional(1, { minWidth: 140 }),
    renderCell: repo => (
      <HStack gap={2} align="center">
        <StatusDot variant={STATE_DOT[repo.state]} label={STATE_LABEL[repo.state]} />
        <Text>{STATE_LABEL[repo.state]}</Text>
      </HStack>
    ),
  },
  { key: 'branch', header: 'Branch', width: proportional(1), renderCell: repo => repo.metadata?.defaultBranch ?? '—' },
  { key: 'pushed', header: 'Pushed', width: proportional(1.5, { minWidth: 180 }), renderCell: repo => <When iso={repo.metadata?.pushedAt} /> },
  { key: 'synced', header: 'Synced', width: proportional(1.5, { minWidth: 180 }), renderCell: repo => <When iso={repo.metadata?.syncedAt} /> },
]

/**
 * The archive: every repository and its state, a form to sync more, and a
 * button to rebuild search caches. Sync and restore run one at a time, and
 * list what happened to each repository as it happens.
 */
export function ReposView({ from, repos, settings, onChanged }: ReposViewProps): React.JSX.Element {
  const [sources, setSources] = useState('')
  const [running, setRunning] = useState<'sync' | 'restore'>()
  const [items, setItems] = useState<(SyncItem | RestoreItem)[]>()
  const [failure, setFailure] = useState<WireError>()
  const controller = useRef<AbortController>(undefined)

  useEffect(() => (): void => controller.current?.abort(), [])

  const run = async (kind: 'sync' | 'restore'): Promise<void> => {
    setRunning(kind)
    setItems([])
    setFailure(undefined)
    const job = kind === 'sync' ? { kind, sources: sources.split(/\s+/).filter(Boolean) } : { kind }
    controller.current = new AbortController()
    const { signal } = controller.current
    const result = await runJob(job, item => setItems(done => [...(done ?? []), item]), signal)
    if (signal.aborted) return
    setRunning(undefined)
    if (!result.ok) setFailure(result.error)
    else if (kind === 'sync') setSources('')
    await onChanged()
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (sources.trim() !== '' && !running) void run('sync')
  }

  return (
    <Layout
      contentWidth={960}
      content={
        <LayoutContent>
          <VStack gap={6}>
            <HStack gap={4} align="center" justify="between" wrap="wrap">
              <Heading level={1}>Repositories</Heading>
              {from.q && (
                <Link to={{ view: 'search', ...from }} isStandalone>
                  ← Back to results
                </Link>
              )}
            </HStack>

            <form onSubmit={submit}>
              <FormLayout>
                <TextArea
                  label="Sync repositories"
                  description="Space- or newline-separated: owner, owner/name, a git URL, or a local path."
                  rows={3}
                  value={sources}
                  hasSpellCheck={false}
                  onChange={setSources}
                  placeholder="cbcruk/bundle-grep"
                />
                <HStack gap={2}>
                  <Button
                    type="submit"
                    variant="primary"
                    label={running === 'sync' ? 'Syncing…' : 'Sync'}
                    isDisabled={!!running || sources.trim() === ''}
                  />
                  <Button
                    label={running === 'restore' ? 'Restoring…' : 'Restore all'}
                    isDisabled={!!running}
                    onClick={() => void run('restore')}
                  />
                </HStack>
              </FormLayout>
            </form>

            {running && <Text color="secondary">Leaving or reloading this page stops the {running}.</Text>}
            {failure && <Banner status="error" title={failure.message} />}
            {items && (items.length > 0 || (!running && !failure)) && (
              <List hasDividers density="compact">
                {items.length === 0 && <ListItem label="Nothing to do." />}
                {items.map((item, index) => {
                  const { subject, text, failed } = itemText(item)
                  return (
                    <ListItem
                      key={index}
                      label={subject}
                      description={text}
                      startContent={<StatusDot variant={failed ? 'error' : 'success'} label={failed ? 'Failed' : 'Done'} />}
                    />
                  )
                })}
              </List>
            )}

            {!repos.ok && <Banner status="error" title={repos.error.message} />}
            {repos.ok && (
              <>
                {repos.value.invalid.map(message => (
                  <Banner key={message} status="error" title={message} />
                ))}
                {repos.value.repos.length === 0 ? (
                  <Text color="secondary">Nothing is archived yet.</Text>
                ) : (
                  <Table data={repos.value.repos.map(repo => ({ ...repo }))} columns={COLUMNS} idKey="name" verticalAlign="top" />
                )}
              </>
            )}

            <MetadataList title={<Heading level={2}>Storage</Heading>}>
              <MetadataListItem label="Root">{settings.root}</MetadataListItem>
              <MetadataListItem label="Bundles">{settings.archiveDir}</MetadataListItem>
              <MetadataListItem label="Search caches">{settings.cacheDir}</MetadataListItem>
            </MetadataList>
          </VStack>
        </LayoutContent>
      }
    />
  )
}
