import { Banner } from '@astryxdesign/core/Banner'
import { Code } from '@astryxdesign/core/Code'

import './query-error.css'
import type { QueryErrorProps } from './query-error.types'

/** Shows why a query was rejected, marking the part of it that is wrong. */
export function QueryError({ query, error, isFloating = false }: QueryErrorProps): React.JSX.Element {
  const span = error.span
  return (
    <Banner status="error" title={error.message} elevation={isFloating ? 'med' : 'none'} collapsible={false}>
      {span && (
        <Code className="query-error-query">
          {query.slice(0, span.offset)}
          <mark>{query.slice(span.offset, span.offset + span.length) || ' '}</mark>
          {query.slice(span.offset + span.length)}
        </Code>
      )}
    </Banner>
  )
}
