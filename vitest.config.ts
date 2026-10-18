import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  test: {
    coverage: {
      include: ['packages/glowglow/src/**/*.ts'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    // Adapter tests import the package by name; point those at source so the
    // test suite does not depend on a prior build. The regexes keep the bare
    // name from swallowing the subpath entries.
    alias: [
      { find: /^glowglow\/dom$/, replacement: src('./packages/glowglow/src/dom.ts') },
      { find: /^glowglow\/incremental$/, replacement: src('./packages/glowglow/src/incremental.ts') },
      { find: /^glowglow$/, replacement: src('./packages/glowglow/src/index.ts') },
    ],
  },
})
