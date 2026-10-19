import { useEffect, useState, type FormEvent } from 'react'

import type { BridgeResult } from '../../api/api.types'
import { bridge } from '../../api/bridge'
import type { RepoRow, RestoreItem, Settings, SyncItem } from '../../../../src/desktop.types'
import { Link } from '../link/link'
import type { ReposViewProps } from './repos-view.types'
import './repos-view.css'

const STATE_LABEL: Record<RepoRow['state'], string> = {
  ready: 'Ready',
  unrestored: 'Needs restore',
  empty: 'Empty',
}

function date(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

function itemText(item: SyncItem | RestoreItem): { subject: string; text: string; failed: boolean } {
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

/**
 * The archive: every repository and its state, a form to sync more, and a
 * button to rebuild search caches. Sync and restore run one at a time.
 */
export function ReposView({ query, repos, onChanged }: ReposViewProps): React.JSX.Element {
  const [sources, setSources] = useState('')
  const [running, setRunning] = useState<'sync' | 'restore'>()
  const [outcome, setOutcome] = useState<BridgeResult<(SyncItem | RestoreItem)[]>>()
  const [settings, setSettings] = useState<Settings>()

  useEffect(() => {
    void bridge()
      .bundleGrepSettings()
      .then(result => {
        if (result.ok) setSettings(result.value)
      })
  }, [])

  const run = async (kind: 'sync' | 'restore'): Promise<void> => {
    setRunning(kind)
    setOutcome(undefined)
    const list = sources.split(/\s+/).filter(Boolean)
    const result: BridgeResult<(SyncItem | RestoreItem)[]> =
      kind === 'sync' ? await bridge().bundleGrepSync(list) : await bridge().bundleGrepRestore()
    setRunning(undefined)
    setOutcome(result)
    if (result.ok && kind === 'sync') setSources('')
    onChanged()
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (sources.trim() !== '' && !running) void run('sync')
  }

  return (
    <div className="repos-view">
      <header className="repos-view-header">
        <h1>Repositories</h1>
        {query && <Link to={{ view: 'search', q: query }}>← Back to results</Link>}
      </header>

      <form className="repos-view-sync" onSubmit={submit}>
        <label htmlFor="sources">Sync repositories</label>
        <p className="hint">
          Space- or newline-separated: <code>owner</code>, <code>owner/name</code>, a git URL, or a local path.
        </p>
        <textarea
          id="sources"
          rows={3}
          value={sources}
          spellCheck={false}
          onChange={event => setSources(event.target.value)}
          placeholder="cbcruk/bundle-grep"
        />
        <div className="repos-view-actions">
          <button type="submit" className="primary" disabled={!!running || sources.trim() === ''}>
            {running === 'sync' ? 'Syncing…' : 'Sync'}
          </button>
          <button type="button" disabled={!!running} onClick={() => void run('restore')}>
            {running === 'restore' ? 'Restoring…' : 'Restore all'}
          </button>
        </div>
      </form>

      {outcome && !outcome.ok && <p className="notice danger">{outcome.error.message}</p>}
      {outcome?.ok && (
        <ul className="repos-view-outcome">
          {outcome.value.length === 0 && <li>Nothing to do.</li>}
          {outcome.value.map((item, index) => {
            const { subject, text, failed } = itemText(item)
            return (
              <li key={index} className={failed ? 'danger' : undefined}>
                <strong>{subject}</strong> {text}
              </li>
            )
          })}
        </ul>
      )}

      {repos === undefined && <p className="hint">Loading…</p>}
      {repos && !repos.ok && <p className="notice danger">{repos.error.message}</p>}
      {repos?.ok && (
        <>
          {repos.value.invalid.map(message => (
            <p key={message} className="notice danger">
              {message}
            </p>
          ))}
          {repos.value.repos.length === 0 ? (
            <p className="hint">Nothing is archived yet.</p>
          ) : (
            <table className="repos-view-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>State</th>
                  <th>Branch</th>
                  <th>Pushed</th>
                  <th>Synced</th>
                </tr>
              </thead>
              <tbody>
                {repos.value.repos.map(repo => (
                  <tr key={repo.name}>
                    <td>
                      <Link to={{ view: 'search', q: `repo:${repo.name}` }}>{repo.name}</Link>
                      {repo.metadata?.description && <div className="hint">{repo.metadata.description}</div>}
                    </td>
                    <td>
                      <span className={`state ${repo.state}`}>{STATE_LABEL[repo.state]}</span>
                    </td>
                    <td>{repo.metadata?.defaultBranch ?? '—'}</td>
                    <td>{date(repo.metadata?.pushedAt)}</td>
                    <td>{date(repo.metadata?.syncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {settings && (
        <dl className="repos-view-settings">
          <dt>Root</dt>
          <dd>{settings.root}</dd>
          <dt>Bundles</dt>
          <dd>{settings.archiveDir}</dd>
          <dt>Search caches</dt>
          <dd>{settings.cacheDir}</dd>
        </dl>
      )}
    </div>
  )
}
