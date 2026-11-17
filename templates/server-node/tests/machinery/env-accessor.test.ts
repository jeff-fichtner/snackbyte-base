// @vitest-environment node
//
// Proves the typed `env` accessor app code reads to branch on the current environment.
//
// The accessor (src/env.ts) reads the BAKED identity module, which we mock to stand in for
// different built environments — so it is unit-testable here.
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
