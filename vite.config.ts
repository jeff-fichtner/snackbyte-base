/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
// SPINUP:server-only:start
import { PORT } from './src/config';
// SPINUP:server-only:end

const webRoot = fileURLToPath(new URL('./src/web', import.meta.url));
const distDir = fileURLToPath(new URL('./dist', import.meta.url));

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  // Use React's automatic JSX runtime everywhere (app build and tests), so test
  // files can write JSX without importing React.
  esbuild: {
    jsx: 'automatic',
  },
  // SPINUP:server-only:start
  // Forward /api calls from the dev frontend to the Express API (same-origin in
  // production), so app code can call relative /api paths in both dev and prod.
  server: {
    proxy: { '/api': `http://localhost:${PORT}` },
  },
  // SPINUP:server-only:end
  build: {
    outDir: distDir,
    emptyOutDir: true,
  },
  test: {
    // jsdom by default so component tests have a DOM. Tests that need the plain Node
    // environment (e.g. server integration tests) declare `// @vitest-environment node`
    // at the top of the file.
    environment: 'jsdom',
    // The template runs its own machinery tests. tests/app/ holds starter tests for
    // the spun-up app (validated via the init test), so they are excluded here and
    // become the app's suite after spin-up.
    include: ['tests/machinery/**/*.test.ts', 'tests/machinery/**/*.test.tsx'],
    root: fileURLToPath(new URL('.', import.meta.url)),
    globals: true,
    // Integration tests build into the shared dist/ and bind fixed ports, so test
    // files must run serially rather than in parallel.
    fileParallelism: false,
  },
});
