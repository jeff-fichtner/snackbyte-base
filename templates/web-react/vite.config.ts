/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolveBuildEnv } from './scripts/resolve-env.mjs';

// Identity + version constants baked into the bundle at build time (so server-render and
// client-hydration see identical values — no live values, no hydration mismatch). The version is
// NOT read from package.json (which holds only MAJOR.MINOR); it arrives as the APP_VERSION
// build-arg the deploy flow sets, alongside CI + BUILD_GIT_COMMIT + BUILD_DATE. Locally they fall
// back to dev.
//
// The environment identity (name + isPublicFace) is resolved from environments.json by
// APP_ENV_NAME (the single build-arg the deploy flow sets). Chip visibility is keyed on the
// resolved isPublicFace, NOT NODE_ENV (the build always runs NODE_ENV=production): a public-face
// build hides the chip (prod); a non-public-face build (e.g. staging, or local dev's `local`
// identity) shows it. Nothing overrides it: the resolved isPublicFace is the single source, and any
// server built from the same manifest entry reports the same environment.
// scripts/prerender.mjs MUST read these identically or prerender and hydration disagree.
const isBuildServer = process.env.CI === 'true';
const buildEnv = resolveBuildEnv();
const versionDefines = {
  'globalThis.__APP_VERSION__': JSON.stringify(
    isBuildServer ? (process.env.APP_VERSION ?? '0.0.0') : '0.0.0-dev',
  ),
  'globalThis.__GIT_COMMIT__': JSON.stringify(process.env.BUILD_GIT_COMMIT ?? 'dev'),
  'globalThis.__BUILD_DATE__': JSON.stringify(process.env.BUILD_DATE ?? 'dev'),
  'globalThis.__APP_ENV_NAME__': JSON.stringify(buildEnv.name),
  'globalThis.__IS_PUBLIC_FACE__': JSON.stringify(buildEnv.isPublicFace),
};
// SPINUP:api-only:start

/**
 * Stops the dev server at startup, naming API_URL, when it has nowhere to forward /api to. Vitest
 * also starts a Vite server to run the tests; that one forwards nothing, so it needs no API_URL.
 */
function requireApiUrl(): void {
  if (!process.env.API_URL && !process.env.VITEST) {
    throw new Error(
      'API_URL is not set. It is the server the dev server forwards /api to; it is set in .env ' +
        '(the app root .env when this is part of a larger app).',
    );
  }
}
// SPINUP:api-only:end

export default defineConfig({
  plugins: [react()],
  define: versionDefines,
  // SPINUP:api-only:start
  // The dev server forwards /api to the app's server (API_URL), so app code calls relative /api
  // paths in development and production alike. Only a running dev server sets up the proxy, so only
  // it requires API_URL; a build or a test run never reads it.
  server: { proxy: { '/api': { target: process.env.API_URL, configure: requireApiUrl } } },
  // SPINUP:api-only:end
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
  test: {
    // jsdom by default so component tests have a DOM. Tests that need the plain Node environment
    // declare `// @vitest-environment node` at the top of the file.
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: true,
    // Build tests write the shared dist/, so test files run one at a time.
    fileParallelism: false,
  },
});
