import { useEffect } from 'react'

import { useGo } from '../../hooks/use-go'
import { segments } from '../../lib/highlight'
import { isTyping } from '../../lib/keyboard'
import { CodeLine } from '../file-result/code-line'
import { Link } from '../link/link'
import type { Route } from '../../lib/route.types'
import type { FileViewProps } from './file-view.types'
import { lineId } from './file-view.utils'
import './file-view.css'

/**
 * One file at `HEAD`, or at the commit the route names, with line numbers.
 *
 * The line the address names is marked and scrolled to, and the matches the
 * search found in this file are highlighted. `Escape` goes back to the results.
 */
export function FileView({ route, blob, highlights }: FileViewProps): React.JSX.Element {
  const go = useGo()
  const back: Route = route.more ? { view: 'search', q: route.q, more: true } : { view: 'search', q: route.q }
  const lines = blob.ok && blob.value.kind === 'text' ? blob.value.lines : undefined

  useEffect(() => {
    if (!lines || route.line === undefined) return
    document.getElementById(lineId(route.line))?.scrollIntoView({ block: 'center' })
  }, [lines, route.line])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || isTyping(event)) return
      go(back)
    }
    window.addEventListener('keydown', onKeyDown)
    return (): void => window.removeEventListener('keydown', onKeyDown)
  }, [route.q, route.more, go])

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
        {route.ref && (
          <code className="file-view-ref" title={route.ref}>
            @ {route.ref.slice(0, 7)}
          </code>
        )}
      </nav>
      <div className="file-view-body">
        {!blob.ok && <p className="file-view-message danger">{blob.error.message}</p>}
        {blob.ok && blob.value.kind === 'binary' && (
          <p className="file-view-message">Binary file ({blob.value.size.toLocaleString('en')} bytes) not shown.</p>
        )}
        {lines && (
          <>
            <p className="file-view-meta">{lines.length.toLocaleString('en')} lines</p>
            <table className="code">
              <tbody>
                {lines.map((text, index) => {
                  const number = index + 1
                  return (
                    <CodeLine
                      key={number}
                      id={lineId(number)}
                      number={number}
                      to={{ ...route, line: number }}
                      replace
                      segments={segments(text, highlights.get(number) ?? [])}
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
