import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { inlineBundle } from './inline-bundle.ts'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), inlineBundle()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // barlo proxies plain HTTP only, so the HMR socket goes to Vite directly.
    hmr: { clientPort: 5173 },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
})
