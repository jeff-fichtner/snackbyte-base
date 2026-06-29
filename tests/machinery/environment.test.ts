// @vitest-environment node
//
// Proves the environment-identity distinction the template guarantees, now driven by the BAKED
// identity (decided at build from environments.json and inlined into the compiled server via
// src/env.generated.ts), NOT a runtime variable:
//   - /api/version reports `environment` from the baked identity, so the running server reports
//     the environment its image was built for (the frontend bundle bakes the same value, so they
//     cannot disagree). NODE_ENV stays production, so the build/version gate is unaffected.
//   - a baked environment whose `noindex` facet is true carries `X-Robots-Tag: noindex` (so a
//     non-public env isn't search-indexed); a public env emits no such header.
// We mock src/env.generated.ts to stand in for different baked identities.
import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';

// Mutable baked identity the mock returns; each test sets it before importing the modules.
let baked = { name: 'local', isPublicFace: false, noindex: true };
vi.mock('../../src/env.generated.js', () => ({
  get BAKED() {
    return baked;
  },
}));

// version.ts and server.ts read the mocked BAKED at import time, so re-import them fresh under
// each baked identity to observe the values they compute.
async function freshVersion() {
  vi.resetModules();
  return (await import('../../src/version.js')).version;
}
async function freshApp() {
  vi.resetModules();
  return (await import('../../src/server.js')).createApp();
}

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
  baked = { name: 'local', isPublicFace: false, noindex: true };
  vi.resetModules();
});

describe('environment label (version.ts reports the baked identity)', () => {
  it('reports "staging" from the baked identity while NODE_ENV stays production (real number preserved)', async () => {
    baked = { name: 'staging', isPublicFace: false, noindex: true };
    process.env.NODE_ENV = 'production';
    process.env.APP_VERSION = '0.1.2-dev';
    const v = await freshVersion();
    expect(v.environment).toBe('staging');
    // NODE_ENV=production keeps the build gate on, so the real number is read — never 0.0.0-dev.
    expect(v.number).toBe('0.1.2-dev');
  });

  it('reports "production" for the production baked identity', async () => {
    baked = { name: 'production', isPublicFace: true, noindex: false };
    process.env.NODE_ENV = 'production';
    process.env.APP_VERSION = '0.1.2';
    const v = await freshVersion();
    expect(v.environment).toBe('production');
    expect(v.number).toBe('0.1.2');
  });

  it('reports "local" when nothing was baked (local dev default)', async () => {
    baked = { name: 'local', isPublicFace: false, noindex: true };
    const v = await freshVersion();
    expect(v.environment).toBe('local');
  });
});

describe('noindex middleware (server.ts reads the baked noindex facet)', () => {
  it('emits X-Robots-Tag: noindex for a baked env whose noindex facet is true (e.g. staging)', async () => {
    baked = { name: 'staging', isPublicFace: false, noindex: true };
    const res = await request(await freshApp()).get('/');
    expect(res.headers['x-robots-tag']).toBe('noindex');
  });

  it('emits no X-Robots-Tag for a public env whose noindex facet is false (production)', async () => {
    baked = { name: 'production', isPublicFace: true, noindex: false };
    const res = await request(await freshApp()).get('/');
    expect(res.headers['x-robots-tag']).toBeUndefined();
  });
});
