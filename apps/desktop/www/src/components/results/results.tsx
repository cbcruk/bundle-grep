import { useEffect, useMemo, useRef, useState } from 'react'

import { navigate } from '../../hooks/use-route'
import { isPageKey, isTyping } from '../../lib/keyboard'
import { groupByRepo } from '../../lib/group'
import { toggleFacet } from '../../lib/query-edit'
import { commitRoute, fileRoute } from '../../lib/result-route'
import { CommitResult } from '../commit-result/commit-result'
import { FileResult } from '../file-result/file-result'
import { Link } from '../link/link'
import { QueryError } from '../query-error/query-error'
import type { CommitResult as CommitEvent, FileResult as FileEvent } from '../../hooks/use-search.types'
import type { ResultsProps } from './results.types'
import { plural, usesHistory, usesSymbol } from './results.utils'
import './results.css'

/**
 * The results column: a summary, archive warnings, failures, and the
 * matching files — or commits, for `history:` — grouped by repository.
 *
 * `j`/`k` or the arrow keys move between results, and `Enter` or `o` opens one.
 * Moving also works while a button such as "Show more" keeps focus after a
 * click; opening does not, so `Enter` still presses the button.
 */
export function Results({ query, search, limit, maxLimit, onShowMore, symbolLanguages }: ResultsProps): React.JSX.Element {
  const [selected, setSelected] = useState(-1)
  const cards = useRef<(HTMLElement | null)[]>([])
  const { status, archive, files, commits, failures, done, error } = search
  const history = usesHistory(query)
  const items = useMemo((): (FileEvent | CommitEvent)[] => [...files, ...commits], [files, commits])
  const groups = useMemo(() => groupByRepo(items), [items])
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
        const item = ordered[selected]
        const route = item && (item.type === 'file' ? fileRoute(query, item) : commitRoute(query, item))
        if (!route) return
        event.preventDefault()
        navigate(route)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return (): void => window.removeEventListener('keydown', onKeyDown)
  }, [ordered, selected, query])

  useEffect(() => {
    cards.current[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (status === 'error' && error) return <QueryError query={query} error={error} />

  const indexOf = new Map(ordered.map((item, index) => [item, index]))
  const noun = history ? 'commit' : 'file'
  const total = (history ? done?.totalCommits : done?.totalFiles) ?? items.length

  return (
    <div className="results">
      <p className="results-summary" aria-live="polite">
        {status === 'running' ? (
          <>Searching… {plural(items.length, noun)} so far</>
        ) : (
          <>
            {done?.capped ? `${total.toLocaleString('en')}+ ${noun}s` : plural(total, noun)}
            {done?.truncated && ` (showing the first ${items.length.toLocaleString('en')})`}
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

      {status === 'done' && items.length === 0 && archive && archive.repos > 0 && (
        <p className="results-empty">
          {history ? 'No commits matched.' : 'No files matched.'}
          {usesSymbol(query) && symbolLanguages.length > 0 && (
            <>
              {' '}
              <code>symbol:</code> finds definitions in {symbolLanguages.join(', ')} files only.
            </>
          )}
        </p>
      )}

      {groups.map(group => (
        <section key={group.repo} className="results-repo">
          <h2>
            <Link to={{ view: 'search', q: toggleFacet(query, { kind: 'repo', value: group.repo }) }} title="Search this repository only">
              {group.repo}
            </Link>
          </h2>
          {group.files.map(item => {
            const index = indexOf.get(item)!
            const ref = (element: HTMLElement | null): void => {
              cards.current[index] = element
            }
            return item.type === 'file' ? (
              <FileResult key={item.path} ref={ref} query={query} file={item} selected={index === selected} />
            ) : (
              <CommitResult key={item.commit.sha} ref={ref} query={query} result={item} selected={index === selected} />
            )
          })}
        </section>
      ))}
    </div>
  )
}
