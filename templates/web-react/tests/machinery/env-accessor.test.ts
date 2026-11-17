// @vitest-environment node
//
// Proves the typed `env` accessor app code reads to branch on the current environment.
//
// The accessor (src/env.ts) reads build-time `define` tokens (__APP_ENV_NAME__, __IS_PUBLIC_FACE__).
// Under vitest those tokens are inlined at transform time (the test config IS vite.config.ts), so a
// runtime `globalThis` assignment cannot change them — the same inlining the chip test documents.
// So this asserts the accessor's *inlined* values (with no APP_ENV_NAME in the test env, they
// resolve to the `local` identity) and relies on the chip test (real builds with APP_ENV_NAME set)
// to prove the non-local baked path.
import { describe, it, expect } from 'vitest';
import { LOCAL } from '../../scripts/resolve-env.mjs';

describe('env accessor (src/env.ts) — inlined identity', () => {
  it('reports the local identity under test, matching the build side', async () => {
    const { env } = await import('../../src/env.js');
    expect(env.name).toBe(LOCAL.name);
    expect(env.isPublicFace).toBe(LOCAL.isPublicFace);
    expect(env.is('local')).toBe(true);
    expect(env.is('production')).toBe(false);
  });
});
