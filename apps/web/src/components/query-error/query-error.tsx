import './query-error.css'
import type { QueryErrorProps } from './query-error.types'

/** Shows why a query was rejected, marking the part of it that is wrong. */
export function QueryError({ query, error }: QueryErrorProps): React.JSX.Element {
  const span = error.span
  return (
    <div className="query-error" role="alert">
      <p className="query-error-message">{error.message}</p>
      {span && (
        <code className="query-error-query">
          {query.slice(0, span.offset)}
          <mark>{query.slice(span.offset, span.offset + span.length) || ' '}</mark>
          {query.slice(span.offset + span.length)}
        </code>
      )}
    </div>
  )
}
