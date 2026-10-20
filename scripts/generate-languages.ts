/**
 * Regenerates `packages/core/src/plan/languages.generated.json` from GitHub
 * Linguist's `languages.yml`.
 *
 * Only what `language:` needs is kept: each language's aliases, extensions,
 * and exact filenames, plus `popular.yml`'s list, which breaks ties between
 * languages sharing an extension. Run with `pnpm exec tsx scripts/generate-languages.ts [ref]`,
 * where `ref` is a Linguist tag or commit and defaults to `main`.
 *
 * @module
 */

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { parse } from 'yaml'

interface LinguistLanguage {
  aliases?: string[]
  extensions?: string[]
  filenames?: string[]
}

const ref = process.argv[2] ?? 'main'
const base = `https://raw.githubusercontent.com/github-linguist/linguist/${ref}/lib/linguist`
const source = `${base}/languages.yml`

async function fetchYaml(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    console.error(`Could not fetch ${url}: ${response.status}`)
    process.exit(1)
  }
  return parse(await response.text())
}

const parsed = (await fetchYaml(source)) as Record<string, LinguistLanguage>
const popular = (await fetchYaml(`${base}/popular.yml`)) as string[]
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

const target = join(import.meta.dirname, '..', 'packages/core/src/plan/languages.generated.json')
await writeFile(target, `${JSON.stringify({ source, popular, languages }, null, 1)}\n`)
console.log(`${Object.keys(languages).length} languages written to ${target}`)
