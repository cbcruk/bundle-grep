import { useEffect, useMemo, useRef, useState } from 'react'

import { navigate } from '../../hooks/use-route'
import { isPageKey, isTyping } from '../../lib/keyboard'
import { groupByRepo } from '../../lib/group'
import { toggleFacet } from '../../lib/query-edit'
import { FileResult } from '../file-result/file-result'
import { Link } from '../link/link'
import { QueryError } from '../query-error/query-error'
import type { ResultsProps } from './results.types'
import { plural } from './results.utils'
import './results.css'

/**
 * The results column: a summary, archive warnings, failures, and the
 * matching files grouped by repository.
 *
 * `j`/`k` or the arrow keys move between files, and `Enter` or `o` opens one.
 * Moving also works while a button such as "Show more" keeps focus after a
 * click; opening does not, so `Enter` still presses the button.
 */
export function Results({ query, search, limit, maxLimit, onShowMore }: ResultsProps): React.JSX.Element {
  const [selected, setSelected] = useState(-1)
  const cards = useRef<(HTMLElement | null)[]>([])
  const { status, archive, files, failures, done, error } = search
  const groups = useMemo(() => groupByRepo(files), [files])
  const ordered = useMemo(() => groups.flatMap(group => group.files), [groups])

  useEffect(() => setSelected(-1), [query, limit])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const onButton = !isTyping(event) && (event.target as HTMLElement | null)?.tagName === 'BUTTON'
      if ((!isPageKey(event) && !onButton) || ordered.length === 0) return
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        setSelected(index => Math.min(index + 1, ordered.length - 1))
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        setSelected(index => Math.max(index - 1, 0))
      } else if ((event.key === 'Enter' || event.key === 'o') && selected >= 0 && !onButton) {
        const file = ordered[selected]
        if (!file) return
        event.preventDefault()
        const line = file.lines.find(candidate => !candidate.context)?.number
        navigate({ view: 'file', q: query, repo: file.repo, path: file.path, ...(line ? { line } : {}) })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return (): void => window.removeEventListener('keydown', onKeyDown)
  }, [ordered, selected, query])

  useEffect(() => {
    cards.current[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (status === 'error' && error) return <QueryError query={query} error={error} />

  const indexOf = new Map(ordered.map((file, index) => [file, index]))
  const total = done?.totalFiles ?? files.length

  return (
    <div className="results">
      <p className="results-summary" aria-live="polite">
        {status === 'running' ? (
          <>Searching… {plural(files.length, 'file')} so far</>
        ) : (
          <>
            {plural(total, 'file')}
            {done?.truncated && ` (showing the first ${files.length.toLocaleString('en')})`}
            {done?.stopped === 'timeout' && ' — stopped early because the search took too long'}
          </>
        )}
        {done?.truncated && limit < maxLimit && (
          <button type="button" className="results-more" onClick={onShowMore}>
            Show up to {maxLimit.toLocaleString('en')}
          </button>
        )}
      </p>

      {archive && archive.repos === 0 && archive.unrestored.length === 0 && (
        <p className="notice">
          Nothing is archived yet. <Link to={{ view: 'repos', q: query }}>Add repositories</Link> to search them.
        </p>
      )}
      {archive && archive.unrestored.length > 0 && (
        <p className="notice">
          {plural(archive.unrestored.length, 'repository', 'repositories')} cannot be searched until restored.{' '}
          <Link to={{ view: 'repos', q: query }}>Restore</Link>
        </p>
      )}
      {archive && archive.invalid.length > 0 && (
        <details className="notice">
          <summary>{plural(archive.invalid.length, 'archive entry', 'archive entries')} could not be read</summary>
          <ul>
            {archive.invalid.map(message => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </details>
      )}
      {failures.map(failure => (
        <p key={failure.repo} className="notice danger">
          <strong>{failure.repo}</strong> could not be searched: {failure.error.message}
        </p>
      ))}

      {status === 'done' && files.length === 0 && archive && archive.repos > 0 && (
        <p className="results-empty">No files matched.</p>
      )}

      {groups.map(group => (
        <section key={group.repo} className="results-repo">
          <h2>
            <Link to={{ view: 'search', q: toggleFacet(query, { kind: 'repo', value: group.repo }) }} title="Search this repository only">
              {group.repo}
            </Link>
          </h2>
          {group.files.map(file => {
            const index = indexOf.get(file)!
            return (
              <FileResult
                key={file.path}
                ref={element => {
                  cards.current[index] = element
                }}
                query={query}
                file={file}
                selected={index === selected}
              />
            )
          })}
        </section>
      ))}
    </div>
  )
}
