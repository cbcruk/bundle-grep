import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { RestoreItem, SyncItem, WireError } from '../../api/api.types'
import { runJob } from '../../api/run-job'
import { Link } from '../link/link'
import type { ReposViewProps } from './repos-view.types'
import { date, itemText, STATE_LABEL } from './repos-view.utils'
import './repos-view.css'

/**
 * The archive: every repository and its state, a form to sync more, and a
 * button to rebuild search caches. Sync and restore run one at a time, and
 * list what happened to each repository as it happens.
 */
export function ReposView({ query, repos, settings, onChanged }: ReposViewProps): React.JSX.Element {
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

      {running && <p className="hint">Leaving or reloading this page stops the {running}.</p>}
      {failure && <p className="notice danger">{failure.message}</p>}
      {items && (items.length > 0 || (!running && !failure)) && (
        <ul className="repos-view-outcome">
          {items.length === 0 && <li>Nothing to do.</li>}
          {items.map((item, index) => {
            const { subject, text, failed } = itemText(item)
            return (
              <li key={index} className={failed ? 'danger' : undefined}>
                <strong>{subject}</strong> {text}
              </li>
            )
          })}
        </ul>
      )}

      {!repos.ok && <p className="notice danger">{repos.error.message}</p>}
      {repos.ok && (
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
                    <td suppressHydrationWarning>{date(repo.metadata?.pushedAt)}</td>
                    <td suppressHydrationWarning>{date(repo.metadata?.syncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <dl className="repos-view-settings">
        <dt>Root</dt>
        <dd>{settings.root}</dd>
        <dt>Bundles</dt>
        <dd>{settings.archiveDir}</dd>
        <dt>Search caches</dt>
        <dd>{settings.cacheDir}</dd>
      </dl>
    </div>
  )
}
