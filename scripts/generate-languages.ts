/**
 * Regenerates `packages/core/src/plan/languages.generated.json` from GitHub
 * Linguist's `languages.yml`.
 *
 * Only what `language:` needs is kept: each language's aliases, extensions,
 * and exact filenames. Run with `bun scripts/generate-languages.ts [ref]`,
 * where `ref` is a Linguist tag or commit and defaults to `main`.
 *
 * @module
 */

import { join } from 'node:path'

interface LinguistLanguage {
  aliases?: string[]
  extensions?: string[]
  filenames?: string[]
}

const ref = process.argv[2] ?? 'main'
const source = `https://raw.githubusercontent.com/github-linguist/linguist/${ref}/lib/linguist/languages.yml`

const response = await fetch(source)
if (!response.ok) {
  console.error(`Could not fetch ${source}: ${response.status}`)
  process.exit(1)
}

const parsed = Bun.YAML.parse(await response.text()) as Record<string, LinguistLanguage>
const languages = Object.fromEntries(
  Object.entries(parsed)
    .filter(([, language]) => language.extensions?.length || language.filenames?.length)
    .map(([name, language]) => [
      name,
      {
        aliases: language.aliases ?? [],
        extensions: language.extensions ?? [],
        filenames: language.filenames ?? [],
      },
    ]),
)

const target = join(import.meta.dir, '..', 'packages/core/src/plan/languages.generated.json')
await Bun.write(target, `${JSON.stringify({ source, languages }, null, 1)}\n`)
console.log(`${Object.keys(languages).length} languages written to ${target}`)
