import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Fixture tests spawn git dozens of times each, so parallel runs on a busy machine outlast the 5s/10s defaults.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
