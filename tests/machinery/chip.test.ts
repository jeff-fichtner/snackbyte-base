// @vitest-environment node
//
// Proves the version chip is BUILD-keyed off the APP_IS_PUBLIC_FACE build-arg (threaded through
// vite.config.ts / scripts/prerender.mjs into __IS_PUBLIC_FACE__), NOT a runtime value. This builds
// the app twice and inspects the prerendered HTML — the only honest proof, since the value is
// inlined at build time (a runtime-global test would be defeated by that very inlining):
//   - APP_IS_PUBLIC_FACE=false (e.g. staging) -> the chip renders in the HTML.
//   - APP_IS_PUBLIC_FACE=true  (prod)         -> the chip is absent (production unchanged).
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const distIndex = fileURLToPath(new URL('../../dist/index.html', import.meta.url));

// This test builds into the shared dist/ with a probe version. Restore a normal build afterward so
// it leaves no APP_VERSION=9.9.9 contamination for any test that reads dist/ without rebuilding
// (test isolation must not depend on file-execution order).
afterAll(() => {
  execFileSync('node', ['scripts/build.mjs'], { stdio: 'ignore' });
});

// A version unlikely to appear by accident, so its presence in the prerendered root is a
// reliable signal the chip rendered (the chip prints `v<number>`; it only renders when shown).
const PROBE_VERSION = '9.9.9';

function buildWith(appIsPublicFace: string): string {
  execFileSync('node', ['scripts/build.mjs'], {
    stdio: 'ignore',
    env: {
      ...process.env,
      CI: 'true',
      NODE_ENV: 'production',
      APP_VERSION: PROBE_VERSION,
      APP_IS_PUBLIC_FACE: appIsPublicFace,
    },
  });
  return readFileSync(distIndex, 'utf8');
}

const htmlHasChip = (html: string): boolean => html.includes(`v${PROBE_VERSION}`);

describe('version chip is build-keyed (APP_IS_PUBLIC_FACE)', () => {
  it('renders the chip on a non-public-face build (APP_IS_PUBLIC_FACE=false)', () => {
    expect(htmlHasChip(buildWith('false'))).toBe(true);
  });

  it('omits the chip on the public-face build (APP_IS_PUBLIC_FACE=true)', () => {
    expect(htmlHasChip(buildWith('true'))).toBe(false);
  });
});
