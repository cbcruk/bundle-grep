import { Card } from '@astryxdesign/core/Card'
import { Code } from '@astryxdesign/core/Code'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack, StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Fragment } from 'react'

import { segments } from '../../lib/highlight'
import { changeRoute } from '../../lib/result-route'
import { syntaxLanguage, syntaxTokens } from '../../lib/syntax'
import { CodeLine } from '../file-result/code-line'
import { Link } from '../link/link'
import type { CommitResultProps } from './commit-result.types'
import '../file-result/file-result.css'

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
    <Card ref={ref} padding={0} className="file-result" aria-current={selected || undefined}>
      <HStack gap={2} paddingInline={3} paddingBlock={2} align="center">
        <Code color="secondary">{commit.sha.slice(0, 7)}</Code>
        <StackItem size="fill">
          <Text weight="semibold">{commit.subject}</Text>
        </StackItem>
        <Text type="supporting">
          {commit.author} · {commit.date.slice(0, 10)}
        </Text>
      </HStack>
      {files.map(file => {
        const lang = syntaxLanguage(file.path, file.language)
        return (
          <Fragment key={file.path}>
            <Divider />
            <HStack gap={2} paddingInline={3} paddingBlock={1} align="center" justify="between">
              <Link to={changeRoute(from, repo, commit, file.path, file.lines[0])} className="file-result-path" weight="semibold">
                {file.path}
              </Link>
              {file.language && <Text type="supporting">{file.language}</Text>}
            </HStack>
            <Divider />
            <table className="code">
              <tbody>
                {file.lines.map(line => (
                  <CodeLine
                    key={`${line.change}:${line.number}`}
                    number={line.number}
                    to={changeRoute(from, repo, commit, file.path, line)}
                    segments={segments(line.text, line.ranges, syntaxTokens([line.text], lang)?.[0])}
                    context={false}
                    change={line.change}
                  />
                ))}
              </tbody>
            </table>
          </Fragment>
        )
      })}
    </Card>
  )
}
