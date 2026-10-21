import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Fragment } from 'react'

import { hunks, segments } from '../../lib/highlight'
import { fileRoute } from '../../lib/result-route'
import { Link } from '../link/link'
import { CodeLine } from './code-line'
import type { FileResultProps } from './file-result.types'
import './file-result.css'

/** One matching file: its path, language, and matching lines with their context. */
export function FileResult({ from, file, selected, ref }: FileResultProps): React.JSX.Element {
  return (
    <Card ref={ref} padding={0} className="file-result" aria-current={selected || undefined}>
      <HStack gap={2} paddingInline={3} paddingBlock={2} align="center" justify="between">
        <Link to={fileRoute(from, file)} className="file-result-path" weight="semibold">
          {file.path}
        </Link>
        {file.language && <Text type="supporting">{file.language}</Text>}
      </HStack>
      <Divider />
      {file.lines.length === 0 ? (
        <HStack paddingInline={3} paddingBlock={2}>
          <Text color="secondary">Matched on its path.</Text>
        </HStack>
      ) : (
        hunks(file.lines).map((hunk, index) => (
          <Fragment key={hunk[0]!.number}>
            {index > 0 && <Divider />}
            <table className="code">
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
          </Fragment>
        ))
      )}
    </Card>
  )
}
