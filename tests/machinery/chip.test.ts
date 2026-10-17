// @vitest-environment node
//
// Proves the version chip is BUILD-keyed off the environment named by APP_ENV_NAME — its
// isPublicFace facet in environments.json, threaded through vite.config.ts /
// scripts/prerender.mjs into __IS_PUBLIC_FACE__ — NOT a runtime value. This builds the app and
// inspects the prerendered HTML — the only honest proof, since the value is inlined at build time
// (a runtime-global test would be defeated by that very inlining):
//   - APP_ENV_NAME=staging    (isPublicFace false) -> the chip renders in the HTML.
//   - APP_ENV_NAME=production (isPublicFace true)  -> the chip is absent.
//   - no variable overrides the facet, so the chip cannot disagree with the server's baked
//     identity (which is resolved from the same manifest entry).
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

function buildWith(env: Record<string, string>): string {
  execFileSync('node', ['scripts/build.mjs'], {
    stdio: 'ignore',
    env: {
      ...process.env,
      CI: 'true',
      NODE_ENV: 'production',
      APP_VERSION: PROBE_VERSION,
      ...env,
    },
  });
  return readFileSync(distIndex, 'utf8');
}

const htmlHasChip = (html: string): boolean => html.includes(`v${PROBE_VERSION}`);

describe('version chip is build-keyed (APP_ENV_NAME -> isPublicFace)', () => {
  it('renders the chip on a non-public-face environment (staging)', () => {
    expect(htmlHasChip(buildWith({ APP_ENV_NAME: 'staging' }))).toBe(true);
  });

  it('omits the chip on the public-face environment (production)', () => {
    expect(htmlHasChip(buildWith({ APP_ENV_NAME: 'production' }))).toBe(false);
  });

  it('ignores a stray APP_IS_PUBLIC_FACE (the manifest decides)', () => {
    expect(htmlHasChip(buildWith({ APP_ENV_NAME: 'staging', APP_IS_PUBLIC_FACE: 'true' }))).toBe(
      true,
    );
  });
});
