import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { randomBytes } from 'node:crypto'
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

export default defineConfig({
  server: { host: '127.0.0.1', port: PORT, strictPort: true },
  plugins: [devSession(), tanstackStart(), viteReact()],
})
