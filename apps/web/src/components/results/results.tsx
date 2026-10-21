import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useGo } from '../../hooks/use-go'
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

/**
 * The results column: a summary, archive warnings, failures, and the
 * matching files — or commits, for `history:` — grouped by repository.
 *
 * `j`/`k` or the arrow keys move between results, and `Enter` or `o` opens one.
 * Moving also works while a button such as "Show more" keeps focus after a
 * click; opening does not, so `Enter` still presses the button.
 */
export function Results({ query, more, search, limit, maxLimit, onShowMore, symbolLanguages }: ResultsProps): React.JSX.Element {
  const from = useMemo(() => (more ? { q: query, more } : { q: query }), [query, more])
  const [selected, setSelected] = useState(-1)
  const go = useGo()
  const cards = useRef<(HTMLDivElement | null)[]>([])
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
        const route = item && (item.type === 'file' ? fileRoute(from, item) : commitRoute(from, item))
        if (!route) return
        event.preventDefault()
        go(route)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return (): void => window.removeEventListener('keydown', onKeyDown)
  }, [ordered, selected, from, go])

  useEffect(() => {
    cards.current[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (status === 'error' && error) return <QueryError query={query} error={error} />

  const indexOf = new Map(ordered.map((item, index) => [item, index]))
  const noun = history ? 'commit' : 'file'
  const total = (history ? done?.totalCommits : done?.totalFiles) ?? items.length

  return (
    <VStack gap={4}>
      <HStack gap={3} align="center" wrap="wrap">
        <Text aria-live="polite">
          {status === 'running' ? (
            <>Searching… {plural(items.length, noun)} so far</>
          ) : (
            <>
              {done?.capped ? `${total.toLocaleString('en')}+ ${noun}s` : plural(total, noun)}
              {done?.truncated && ` (showing the first ${items.length.toLocaleString('en')})`}
              {done?.stopped === 'timeout' && ' — stopped early because the search took too long'}
            </>
          )}
        </Text>
        {done?.truncated && limit < maxLimit && (
          <Button label={`Show up to ${maxLimit.toLocaleString('en')}`} size="sm" onClick={onShowMore} />
        )}
      </HStack>

      {archive && archive.repos === 0 && archive.unrestored.length === 0 && (
        <Banner
          status="info"
          title="Nothing is archived yet."
          endContent={<Link to={{ view: 'repos', q: query }}>Add repositories</Link>}
        />
      )}
      {archive && archive.unrestored.length > 0 && (
        <Banner
          status="warning"
          title={`${plural(archive.unrestored.length, 'repository', 'repositories')} cannot be searched until restored.`}
          endContent={<Link to={{ view: 'repos', q: query }}>Restore</Link>}
        />
      )}
      {archive && archive.invalid.length > 0 && (
        <Banner
          status="warning"
          title={`${plural(archive.invalid.length, 'archive entry', 'archive entries')} could not be read`}
          collapsible={{ defaultIsOpen: false }}
        >
          <List listStyle="disc">
            {archive.invalid.map(message => (
              <ListItem key={message} label={message} />
            ))}
          </List>
        </Banner>
      )}
      {failures.map(failure => (
        <Banner key={failure.repo} status="error" title={`${failure.repo} could not be searched`} description={failure.error.message} />
      ))}

      {status === 'done' && items.length === 0 && archive && archive.repos > 0 && (
        <EmptyState
          title={history ? 'No commits matched.' : 'No files matched.'}
          description={
            usesSymbol(query) && symbolLanguages.length > 0
              ? `symbol: finds definitions in ${symbolLanguages.join(', ')} files only.`
              : undefined
          }
        />
      )}

      {groups.map(group => (
        <VStack key={group.repo} as="section" gap={2}>
          <Heading level={2}>
            <Link to={{ view: 'search', q: toggleFacet(query, { kind: 'repo', value: group.repo }) }} color="primary" size="lg" weight="semibold">
              {group.repo}
            </Link>
          </Heading>
          {group.files.map(item => {
            const index = indexOf.get(item)!
            const ref = (element: HTMLDivElement | null): void => {
              cards.current[index] = element
            }
            return item.type === 'file' ? (
              <FileResult key={item.path} ref={ref} from={from} file={item} selected={index === selected} />
            ) : (
              <CommitResult key={item.commit.sha} ref={ref} from={from} result={item} selected={index === selected} />
            )
          })}
        </VStack>
      ))}
    </VStack>
  )
}
