import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // tests/no-api/ holds the smoke test for a server resolved without its API; the resolver moves it
    // into tests/app/ when it removes the API.
    include: ['tests/app/**/*.test.ts', 'tests/machinery/**/*.test.ts'],
    globals: true,
    // Resolver and build tests write the shared dist/ and bind fixed ports, so test files run one
    // at a time.
    fileParallelism: false,
  },
});
