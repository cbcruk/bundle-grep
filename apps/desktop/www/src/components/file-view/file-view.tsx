import { useEffect, useMemo } from 'react'

import { useBlob } from '../../hooks/use-blob'
import { navigate } from '../../hooks/use-route'
import { segments } from '../../lib/highlight'
import { isTyping } from '../../lib/keyboard'
import { CodeLine } from '../file-result/code-line'
import { Link } from '../link/link'
import type { FileViewProps } from './file-view.types'
import { lineId } from './file-view.utils'
import './file-view.css'

/**
 * One file at `HEAD`, with line numbers.
 *
 * The line the address names is marked and scrolled to, and the matches the
 * search found in this file are highlighted. `Escape` goes back to the results.
 */
export function FileView({ route, matches }: FileViewProps): React.JSX.Element {
  const blob = useBlob(route.repo, route.path)
  const ranges = useMemo(() => new Map(matches.filter(line => !line.context).map(line => [line.number, line.ranges])), [matches])
  const back = { view: 'search', q: route.q } as const

  useEffect(() => {
    if (blob.status !== 'text' || route.line === undefined) return
    document.getElementById(lineId(route.line))?.scrollIntoView({ block: 'center' })
  }, [blob.status, route.line])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || isTyping(event)) return
      navigate(back)
    }
    window.addEventListener('keydown', onKeyDown)
    return (): void => window.removeEventListener('keydown', onKeyDown)
  }, [route.q])

  return (
    <div className="file-view">
      <nav className="file-view-crumbs" aria-label="Breadcrumbs">
        {route.q && (
          <Link to={back} className="file-view-back">
            ← Results
          </Link>
        )}
        <Link to={{ view: 'search', q: `repo:${route.repo}` }}>{route.repo}</Link>
        {route.path.split('/').map((segment, index, all) => (
          <span key={index}>
            <span className="file-view-separator">/</span>
            {index === all.length - 1 ? <strong>{segment}</strong> : segment}
          </span>
        ))}
      </nav>
      <div className="file-view-body">
        {blob.status === 'loading' && <p className="file-view-message">Loading…</p>}
        {blob.status === 'error' && <p className="file-view-message danger">{blob.error.message}</p>}
        {blob.status === 'binary' && (
          <p className="file-view-message">Binary file ({blob.size.toLocaleString('en')} bytes) not shown.</p>
        )}
        {blob.status === 'text' && (
          <>
            <p className="file-view-meta">{blob.lines.length.toLocaleString('en')} lines</p>
            <table className="code">
              <tbody>
                {blob.lines.map((text, index) => {
                  const number = index + 1
                  return (
                    <CodeLine
                      key={number}
                      id={lineId(number)}
                      number={number}
                      to={{ ...route, line: number }}
                      replace
                      segments={segments(text, ranges.get(number) ?? [])}
                      context={false}
                      marked={number === route.line}
                    />
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
