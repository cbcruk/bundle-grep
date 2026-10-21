import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const PORT = 5173

/**
 * Gives `vite dev` a one-time code, as `bundle-grep ui` would, and prints the
 * link that trades it for a session.
 */
function devSession(): Plugin {
  return {
    name: 'bundle-grep-dev-session',
    apply: 'serve',
    configureServer(server) {
      const code = randomBytes(32).toString('base64url')
      process.env.BUNDLE_GREP_DEV_CODE = code
      process.env.BUNDLE_GREP_DEV_PORT = String(PORT)
      server.httpServer?.once('listening', () => {
        server.config.logger.info(`\n  bundle-grep session: http://127.0.0.1:${PORT}/session?code=${code}\n`)
      })
    },
  }
}

/**
 * Lists the packages each build bundled in `dist/<environment>.packages.json`,
 * for the CLI's third-party license notices.
 */
function bundledPackages(): Plugin {
  return {
    name: 'bundle-grep-bundled-packages',
    apply: 'build',
    generateBundle() {
      const dirs = new Set<string>()
      for (const id of this.getModuleIds()) {
        const dir = /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(id)?.[1]
        if (dir) dirs.add(dir)
      }
      const out = join(import.meta.dirname, 'dist')
      mkdirSync(out, { recursive: true })
      writeFileSync(join(out, `${this.environment.name}.packages.json`), `${JSON.stringify([...dirs].sort(), null, 2)}\n`)
    },
  }
}

export default defineConfig({
  server: { host: '127.0.0.1', port: PORT, strictPort: true },
  ssr: { noExternal: true },
  plugins: [devSession(), bundledPackages(), tanstackStart(), viteReact()],
})
