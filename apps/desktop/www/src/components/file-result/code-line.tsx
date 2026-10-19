import { Link } from '../link/link'
import type { CodeLineProps } from './file-result.types'

/** One numbered line of code, with its matches highlighted. */
export function CodeLine({ number, to, replace, segments, context, marked, id }: CodeLineProps): React.JSX.Element {
  const classes = ['code-line', context && 'context', marked && 'marked'].filter(Boolean).join(' ')
  return (
    <tr className={classes} id={id}>
      <td className="code-number">
        <Link to={to} replace={replace} title={`Line ${number}`}>
          {number}
        </Link>
      </td>
      <td className="code-text">
        {segments.map((segment, index) => (segment.match ? <mark key={index}>{segment.text}</mark> : segment.text))}
      </td>
    </tr>
  )
}
