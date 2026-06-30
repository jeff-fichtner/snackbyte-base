// @vitest-environment node
//
// Proves the typed `env` accessor app code reads to branch on the current environment.
//
// The SERVER accessor (src/env.ts) reads the BAKED identity module, which we mock to stand in for
// different built environments — so it is unit-testable here.
//
// The FRONTEND accessor (src/web/env.ts) reads build-time `define` tokens (__APP_ENV_NAME__,
// __IS_PUBLIC_FACE__). Under vitest those tokens are inlined at transform time (the test config IS
// vite.config.ts), so a runtime `globalThis` assignment cannot change them — the same inlining the
// chip test documents. We therefore assert the frontend accessor's *inlined* values here (with no
// APP_ENV_NAME in the test env, they resolve to the `local` fallback) and rely on the chip test +
// the build-equivalence check (real builds with APP_ENV_NAME set) to prove the non-local baked path.
import { describe, it, expect, afterEach, vi } from 'vitest';

let baked = { name: 'local', isPublicFace: false, noindex: true };
vi.mock('../../src/env.generated.js', () => ({
  get BAKED() {
    return baked;
  },
}));

async function freshServerEnv() {
  vi.resetModules();
  return (await import('../../src/env.js')).env;
}

afterEach(() => {
  baked = { name: 'local', isPublicFace: false, noindex: true };
  vi.resetModules();
});

describe('server env accessor (src/env.ts) reports the baked identity', () => {
  it('reports a non-public env and is() matches', async () => {
    baked = { name: 'staging', isPublicFace: false, noindex: true };
    const env = await freshServerEnv();
    expect(env.name).toBe('staging');
    expect(env.isPublicFace).toBe(false);
    expect(env.is('staging')).toBe(true);
    expect(env.is('production')).toBe(false);
  });

  it('reports the public-face production env', async () => {
    baked = { name: 'production', isPublicFace: true, noindex: false };
    const env = await freshServerEnv();
    expect(env.name).toBe('production');
    expect(env.isPublicFace).toBe(true);
    expect(env.is('production')).toBe(true);
  });

  it('falls back to local when nothing is baked', async () => {
    baked = { name: 'local', isPublicFace: false, noindex: true };
    const env = await freshServerEnv();
    expect(env.name).toBe('local');
    expect(env.isPublicFace).toBe(false);
  });
});

describe('frontend env accessor (src/web/env.ts) — inlined fallback', () => {
  it('reports the local fallback under test (no APP_ENV_NAME inlined), mirroring the server local identity', async () => {
    // The tokens inline to the local fallback in the test build; this proves the accessor shape and
    // the local default agree with the server accessor's local identity. Non-local baked values are
    // proven by the chip test and the build-equivalence check (real builds).
    const { env } = await import('../../src/web/env.js');
    expect(env.name).toBe('local');
    expect(env.isPublicFace).toBe(false);
    expect(env.is('local')).toBe(true);
    expect(env.is('production')).toBe(false);
  });
});
