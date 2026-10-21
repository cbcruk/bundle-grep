import { hunks, segments } from '../../lib/highlight'
import { fileRoute } from '../../lib/result-route'
import { Link } from '../link/link'
import { CodeLine } from './code-line'
import type { FileResultProps } from './file-result.types'
import './file-result.css'

/** One matching file: its path, language, and matching lines with their context. */
export function FileResult({ from, file, selected, ref }: FileResultProps): React.JSX.Element {
  const open = fileRoute(from, file)
  return (
    <article ref={ref} className={selected ? 'file-result selected' : 'file-result'} aria-current={selected || undefined}>
      <header className="file-result-header">
        <Link to={open} className="file-result-path">
          {file.path}
        </Link>
        {file.language && <span className="file-result-language">{file.language}</span>}
      </header>
      {file.lines.length === 0 ? (
        <p className="file-result-path-only">Matched on its path.</p>
      ) : (
        <div className="file-result-lines">
          {hunks(file.lines).map(hunk => (
            <table key={hunk[0]!.number} className="code">
              <tbody>
                {hunk.map(line => (
                  <CodeLine
                    key={line.number}
                    number={line.number}
                    to={fileRoute(from, file, line.number)}
                    segments={segments(line.text, line.ranges)}
                    context={line.context}
                  />
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}
    </article>
  )
}
