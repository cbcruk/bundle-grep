/**
 * Lints exported symbols for missing JSDoc and type-checks every `@example`
 * block.
 *
 * The rules in `.claude/rules/jsdoc.md` ask for documentation on every exported
 * symbol and for examples that run when pasted. Both are easy to let rot, so
 * they are checked rather than trusted. Run with `pnpm docs:check`.
 *
 * Adapted from barlo's `scripts/doccheck.ts`, extended to every workspace
 * package.
 *
 * @module
 */

import { spawnSync } from 'node:child_process'
import { globSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** Top-level `export` forms that need their own JSDoc block. */
const EXPORT = /^export (async function|function|class|interface|type|const|default)\b/

/** Class and interface members, which need documenting too. */
const MEMBER = /^  (?!#|\/|\*|\})(?:readonly |static |async |get |set )*[A-Za-z_$][\w$]*\s*[(<:=]/

const missing: string[] = []
const examples: { file: string; code: string }[] = []

for (const rel of globSync('{packages,apps}/*/{src,test}/**/*.{ts,tsx}', { cwd: ROOT }).sort()) {
  if (rel.endsWith('.test.ts') || rel.endsWith('.gen.ts')) continue
  const text = await readFile(join(ROOT, rel), 'utf8')
  if (text.includes('@generated')) continue
  const lines = text.split('\n')

  let inType = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^export (class|interface)/.test(line)) inType = true
    if (line === '}') inType = false

    if (line.startsWith('export default')) continue
    // Re-exports are documented where they are declared.
    if (/^export (type )?\{/.test(line)) continue
    if (!EXPORT.test(line) && !(inType && MEMBER.test(line))) continue

    let j = i - 1
    while (j >= 0 && lines[j]!.trim() === '') j--
    if (j < 0 || !lines[j]!.trim().endsWith('*/')) {
      missing.push(`${rel}:${i + 1}  ${line.trim().slice(0, 72)}`)
    }
  }

  for (const match of text.matchAll(/\*\s*```ts\n([\s\S]*?)\*\s*```/g)) {
    const code = match[1]!
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, ''))
      .join('\n')
    examples.push({ file: rel, code })
  }
}

console.log(`exported symbols missing JSDoc: ${missing.length}`)
for (const entry of missing) console.log(`  ${entry}`)

// Each example is checked as its own module beside the file it documents, so a
// relative import in a test helper's example resolves the way it reads.
const dir = mkdtempSync(join(ROOT, 'node_modules', '.doccheck-'))
try {
  const files = examples.map((example, n) => {
    const file = join(dir, `ex${n}_${example.file.replace(/\W/g, '_')}.ts`)
    const source = join(ROOT, example.file, '..')
    const code = example.code.replace(/from "\.\/([^"]+)"/g, (_, path) => `from "${join(source, path)}"`)
    writeFileSync(file, code)
    return file
  })
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        lib: ['ESNext'],
        target: 'ESNext',
        module: 'Preserve',
        moduleResolution: 'bundler',
        types: ['node'],
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        resolveJsonModule: true,
        paths: {
          '@bundle-grep/core': [join(ROOT, 'packages/core/src/index.ts')],
          '@bundle-grep/core/query': [join(ROOT, 'packages/core/src/query/index.ts')],
        },
      },
      files,
    }),
  )

  const tsc = spawnSync('pnpm', ['exec', 'tsc', '--noEmit', '-p', dir], { cwd: ROOT, encoding: 'utf8' })
  const output = tsc.error ? `could not run tsc: ${tsc.error.message}` : `${tsc.stdout}${tsc.stderr}`.trim()

  console.log(`example blocks type-checked: ${examples.length}`)
  console.log(output || 'all example blocks OK')

  process.exitCode = missing.length === 0 && !output ? 0 : 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
