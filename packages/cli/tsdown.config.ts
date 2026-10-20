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
    thirdPartyLicenses([
      { from: '../core', names: GRAMMARS.map(name => `tree-sitter-${name}`) },
      { from: '../../apps/desktop', names: ['react', 'react-dom'] },
      { from: '../../apps/desktop/node_modules/react-dom', names: ['scheduler'] },
    ]),
  ],
  copy: [
    {
      from: [
        '../core/node_modules/web-tree-sitter/web-tree-sitter.wasm',
        ...GRAMMARS.map(name => `../core/node_modules/tree-sitter-${name}/*.wasm`),
      ],
      to: 'dist/wasm',
    },
    { from: '../../apps/desktop/www/dist/index.html', to: 'dist/ui' },
  ],
})
