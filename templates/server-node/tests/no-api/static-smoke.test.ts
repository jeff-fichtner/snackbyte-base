import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/server.js';

// Smoke test for a server with no API: it serves the built web app, and any /api request falls
// through to the web app's HTML. A small stand-in web build is enough to prove the serving.
let webRoot: string;

beforeAll(() => {
  webRoot = mkdtempSync(join(tmpdir(), 'static-smoke-'));
  writeFileSync(join(webRoot, 'index.html'), '<!doctype html><div id="root"></div>');
});
afterAll(() => {
  rmSync(webRoot, { recursive: true, force: true });
});

describe('app serves', () => {
  it('serves the built web app', async () => {
    const res = await request(createApp(webRoot)).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root"');
  });

  it('has no API — /api falls through to the web app', async () => {
    const res = await request(createApp(webRoot)).get('/api/anything');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<div id="root"');
  });
});
