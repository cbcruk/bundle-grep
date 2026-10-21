import { cpSync } from 'node:fs'
import { defineConfig } from 'tsdown'

import { thirdPartyLicenses } from './third-party-licenses.ts'

const GRAMMARS = ['c', 'cpp', 'c-sharp', 'go', 'java', 'javascript', 'python', 'ruby', 'rust', 'typescript']

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  dts: false,
  fixedExtension: true,
  deps: { onlyBundle: false },
  plugins: [
    thirdPartyLicenses(
      [{ from: '../core', names: GRAMMARS.map(name => `tree-sitter-${name}`) }],
      ['../../apps/web/dist/client.packages.json', '../../apps/web/dist/ssr.packages.json'],
    ),
  ],
  copy: [
    {
      from: [
        '../core/node_modules/web-tree-sitter/web-tree-sitter.wasm',
        ...GRAMMARS.map(name => `../core/node_modules/tree-sitter-${name}/*.wasm`),
      ],
      to: 'dist/wasm',
    },
  ],
  hooks: {
    'build:done': (): void => {
      for (const part of ['client', 'server']) cpSync(`../../apps/web/dist/${part}`, `dist/web/${part}`, { recursive: true })
    },
  },
})
