import { Code } from '@astryxdesign/core/Code'
import { Heading } from '@astryxdesign/core/Heading'
import { Kbd } from '@astryxdesign/core/Kbd'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

/** The empty search screen: what queries can say, and the keyboard shortcuts. */
export function StartPage(): React.JSX.Element {
  return (
    <Layout
      contentWidth={640}
      content={
        <LayoutContent padding={10}>
          <VStack gap={4}>
            <Heading level={1}>Search your archive</Heading>
            <Text as="p">
              Queries follow GitHub code search: <Code>useState language:typescript</Code>, <Code>repo:owner/name</Code>,{' '}
              <Code>path:/src/**</Code>, <Code>symbol:useState</Code>, <Code>/regex/</Code>, <Code>"exact phrase"</Code>,{' '}
              <Code>NOT</Code>, <Code>OR</Code>.
            </Text>
            <Text as="p">
              <Code>ref:v1.0 useState</Code> searches a branch, tag, or commit instead of the default branch, and{' '}
              <Code>history:useState path:src</Code> finds the commits that added or removed matching lines, deleted code
              included.
            </Text>
            <Text as="p">
              Press <Kbd keys="/" /> to search, <Kbd keys="j" />/<Kbd keys="k" /> to move between results,{' '}
              <Kbd keys="enter" /> to open one, and <Kbd keys="escape" /> to go back.
            </Text>
          </VStack>
        </LayoutContent>
      }
    />
  )
}
