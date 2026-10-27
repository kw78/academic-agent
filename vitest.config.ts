import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-tools': fileURLToPath(
        new URL('./tests/helpers/dsh-tools-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: [
      'packages/**/test/**/*.test.ts',
      'adapters/**/test/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
})
