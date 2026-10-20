/**
 * Times searches over a directory of bare repositories at several repository
 * counts, so changes to the search path can be compared before and after.
 *
 * Every `*.git` directory under `--dir` is a repository, in name order. A
 * count larger than the directory holds reuses the repositories under new
 * names, which costs git the same work again but no disk space. Each query
 * runs once to warm the page cache and git's own caches, then `--runs` times;
 * the median is reported. Run with `pnpm bench --dir <dir>`.
 *
 * @module
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { compileQuery, parseQuery, search, type SearchRepo } from '../packages/core/src'

const DEFAULT_QUERIES = [
  'bundleGrepNoSuchToken',
  'useState',
  'content:useState',
  '/use[A-Z]\\w+/',
  'path:README',
  'useState language:typescript',
  'symbol:useState',
  'history:useState',
]

interface Timing {
  ms: number
  found: string
}

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    counts: { type: 'string', default: '10,100,500' },
    runs: { type: 'string', default: '3' },
    concurrency: { type: 'string' },
    limit: { type: 'string', default: '100' },
    query: { type: 'string', multiple: true },
  },
})
if (!values.dir) throw new Error('Usage: pnpm bench --dir <dir of bare repos> [--counts 10,100,500] [--runs 3] [--query q]...')

const dir = values.dir
const available = readdirSync(dir)
  .filter(name => name.endsWith('.git'))
  .sort()
const counts = values.counts.split(',').map(Number)
const runs = Number(values.runs)
const limit = Number(values.limit)
const concurrency = values.concurrency === undefined ? undefined : Number(values.concurrency)
const queries = values.query?.length ? values.query : DEFAULT_QUERIES

function reposFor(count: number): SearchRepo[] {
  return Array.from({ length: count }, (_, index) => {
    const name = available[index % available.length]!
    return { name: `copy${Math.floor(index / available.length)}/${name}`, gitDir: join(dir, name) }
  })
}

async function time(query: string, repos: SearchRepo[]): Promise<Timing> {
  const plan = parseQuery(query).andThen(compileQuery).unwrap()
  const start = performance.now()
  let found = ''
  for await (const event of search({ plan, repos, holds: () => true, limit, ...(concurrency ? { concurrency } : {}) })) {
    if (event.type === 'done') found = `${event.totalCommits ?? event.totalFiles}${event.capped ? '+' : ''}`
  }
  return { ms: performance.now() - start, found }
}

function median(numbers: number[]): number {
  const sorted = numbers.toSorted((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

console.log(`${available.length} repositories in ${dir}; concurrency ${concurrency ?? 'default'}, limit ${limit}, median of ${runs}\n`)
console.log(['query', ...counts.map(count => `${count} repos`)].join('\t'))
for (const query of queries) {
  const cells: string[] = []
  for (const count of counts) {
    const repos = reposFor(count)
    await time(query, repos)
    const timings: Timing[] = []
    for (let run = 0; run < runs; run++) timings.push(await time(query, repos))
    cells.push(`${median(timings.map(timing => timing.ms)).toFixed(0)} ms (${timings[0]!.found})`)
  }
  console.log([query, ...cells].join('\t'))
}
