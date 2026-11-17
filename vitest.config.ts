import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['hub/tests/**/*.test.ts'],
    // Composition tests build real apps and bind fixed ports, so test files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 300_000,
  },
});
