import { defineConfig } from 'tsdown'

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
  copy: [
    {
      from: [
        '../core/node_modules/web-tree-sitter/web-tree-sitter.wasm',
        ...['c', 'cpp', 'c-sharp', 'go', 'java', 'javascript', 'python', 'ruby', 'rust', 'typescript'].map(
          name => `../core/node_modules/tree-sitter-${name}/*.wasm`,
        ),
      ],
      to: 'dist/wasm',
    },
    { from: '../../apps/desktop/www/dist/index.html', to: 'dist/ui' },
  ],
})
