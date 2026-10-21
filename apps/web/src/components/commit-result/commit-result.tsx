import { segments } from '../../lib/highlight'
import { changeRoute } from '../../lib/result-route'
import { CodeLine } from '../file-result/code-line'
import { Link } from '../link/link'
import type { CommitResultProps } from './commit-result.types'
import '../file-result/file-result.css'
import './commit-result.css'

/**
 * One commit a `history:` search found: its id, date, author, and subject,
 * then each file's matching added and removed lines.
 *
 * An added line opens the file at the commit and a removed one at its
 * parent, where the line's number points.
 */
export function CommitResult({ from, result, selected, ref }: CommitResultProps): React.JSX.Element {
  const { repo, commit, files } = result
  return (
    <article ref={ref} className={selected ? 'file-result selected' : 'file-result'} aria-current={selected || undefined}>
      <header className="file-result-header commit-result-header">
        <code className="commit-result-sha" title={commit.sha}>
          {commit.sha.slice(0, 7)}
        </code>
        <span className="commit-result-subject">{commit.subject}</span>
        <span className="commit-result-meta">
          {commit.author} · <time dateTime={commit.date}>{commit.date.slice(0, 10)}</time>
        </span>
      </header>
      {files.map(file => (
        <section key={file.path} className="commit-result-file">
          <div className="commit-result-path">
            <Link to={changeRoute(from, repo, commit, file.path, file.lines[0])} className="file-result-path">
              {file.path}
            </Link>
            {file.language && <span className="file-result-language">{file.language}</span>}
          </div>
          <table className="code">
            <tbody>
              {file.lines.map(line => (
                <CodeLine
                  key={`${line.change}:${line.number}`}
                  number={line.number}
                  to={changeRoute(from, repo, commit, file.path, line)}
                  segments={segments(line.text, line.ranges)}
                  context={false}
                  change={line.change}
                />
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </article>
  )
}
