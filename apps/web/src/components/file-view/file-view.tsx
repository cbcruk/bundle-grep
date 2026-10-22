import { Banner } from '@astryxdesign/core/Banner'
import { BreadcrumbItem, Breadcrumbs } from '@astryxdesign/core/Breadcrumbs'
import { Card } from '@astryxdesign/core/Card'
import { Code } from '@astryxdesign/core/Code'
import { Divider } from '@astryxdesign/core/Divider'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { useEffect, useMemo } from 'react'

import { useGo } from '../../hooks/use-go'
import { segments } from '../../lib/highlight'
import { isTyping } from '../../lib/keyboard'
import { routeHref } from '../../lib/route'
import { syntaxLanguage, syntaxTokens } from '../../lib/syntax'
import { CodeLine } from '../file-result/code-line'
import { Link } from '../link/link'
import type { Route } from '../../lib/route.types'
import type { FileViewProps } from './file-view.types'
import { lineId } from './file-view.utils'
import '../file-result/file-result.css'

/**
 * One file at `HEAD`, or at the commit the route names, with line numbers.
 *
 * The code is colored by syntax, the line the address names is marked and
 * scrolled to, and the matches the search found in this file are highlighted. `Escape` goes back to the results.
 */
export function FileView({ route, blob, highlights }: FileViewProps): React.JSX.Element {
  const go = useGo()
  const back: Route = route.more ? { view: 'search', q: route.q, more: true } : { view: 'search', q: route.q }
  const lines = blob.ok && blob.value.kind === 'text' ? blob.value.lines : undefined
  const tokens = useMemo(() => lines && syntaxTokens(lines, syntaxLanguage(route.path)), [lines, route.path])

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

  const parts = route.path.split('/')
  return (
    <Layout
      content={
        <LayoutContent>
          <VStack gap={3}>
            <HStack gap={4} align="center" wrap="wrap">
              {route.q && (
                <Link to={back} isStandalone>
                  ← Results
                </Link>
              )}
              <Breadcrumbs label="File">
                <BreadcrumbItem href={routeHref({ view: 'search', q: `repo:${route.repo}` })} isCurrent={false}>
                  {route.repo}
                </BreadcrumbItem>
                {parts.map((segment, index) => (
                  <BreadcrumbItem key={index} isCurrent={index === parts.length - 1}>
                    {segment}
                  </BreadcrumbItem>
                ))}
              </Breadcrumbs>
              {route.ref && (
                <Tooltip content={route.ref}>
                  <Code color="secondary" tabIndex={0}>
                    @ {route.ref.slice(0, 7)}
                  </Code>
                </Tooltip>
              )}
            </HStack>
            {!blob.ok && <Banner status="error" title={blob.error.message} />}
            {blob.ok && blob.value.kind === 'binary' && (
              <Text color="secondary">Binary file ({blob.value.size.toLocaleString('en')} bytes) not shown.</Text>
            )}
            {lines && (
              <Card padding={0}>
                <HStack paddingInline={3} paddingBlock={2}>
                  <Text type="supporting">{lines.length.toLocaleString('en')} lines</Text>
                </HStack>
                <Divider />
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
                          segments={segments(text, highlights.get(number) ?? [], tokens?.[index])}
                          context={false}
                          marked={number === route.line}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </Card>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  )
}
