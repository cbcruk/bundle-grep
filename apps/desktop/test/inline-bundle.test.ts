import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { build } from 'vite'

import { inlineBundle } from '../www/inline-bundle'

const root = mkdtempSync(join(tmpdir(), 'inline-bundle-'))

afterAll(() => rmSync(root, { recursive: true, force: true }))

test('the build is one HTML file, and inlined code cannot end its element early', async () => {
  writeFileSync(
    join(root, 'index.html'),
    '<!doctype html><html><head><title>t</title></head><body><script type="module" src="/main.js"></script></body></html>',
  )
  writeFileSync(join(root, 'main.js'), 'import "./style.css"\ndocument.body.dataset.tag = "</script><b>"\n')
  writeFileSync(join(root, 'style.css'), 'body::after { content: "</style>"; }\n')

  await build({ root, logLevel: 'silent', configFile: false, plugins: [inlineBundle()], build: { outDir: 'dist', cssCodeSplit: false } })

  expect(readdirSync(join(root, 'dist'), { recursive: true })).toEqual(['index.html'])
  const html = await Bun.file(join(root, 'dist/index.html')).text()
  expect(html).not.toMatch(/src=|href=/)
  expect(html.match(/<\/script>/g)).toHaveLength(1)
  expect(html.match(/<\/style>/g)).toHaveLength(1)
  expect(html).toContain('<\\/script><b>')
  expect(html).toContain('<\\/style>')
})

async function buildFails(files: Record<string, string>): Promise<string> {
  const dir = mkdtempSync(join(root, 'case-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>')
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return build({ root: dir, logLevel: 'silent', configFile: false, plugins: [inlineBundle()], build: { outDir: 'dist' } }).then(
    () => 'built',
    (error: Error) => error.message,
  )
}

test('code with "<!--" fails the build rather than being inlined', async () => {
  expect(await buildFails({ 'main.js': 'console.log("<!--")\n' })).toContain('<!--')
})

test('a chunk that cannot be inlined fails the build rather than being left out', async () => {
  expect(await buildFails({ 'main.js': 'import("./later.js")\n', 'later.js': 'console.log(1)\n' })).toContain('not inlined')
})
