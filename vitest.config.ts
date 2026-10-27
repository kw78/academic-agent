import { defineConfig } from 'vitest/config'

export default defineConfig({
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
