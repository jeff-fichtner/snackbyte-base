import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/server.js';

// Smoke test for a server with an API: it serves the built web app and its API responds. A small
// stand-in web build is enough to prove the serving. Use this as a pattern for your own routes.
let webRoot: string;

beforeAll(() => {
  webRoot = mkdtempSync(join(tmpdir(), 'server-smoke-'));
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

  it('serves the web app for a client-side route', async () => {
    const res = await request(createApp(webRoot)).get('/some/client/route');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root"');
  });

  it.each([
    ['GET', '/api/not-a-route'],
    ['GET', '/api'],
    ['GET', '/api/a/b'],
    ['POST', '/api/not-a-route'],
  ] as const)(
    'answers 404 JSON, not the web app, for an unknown API path (%s %s)',
    async (method, path) => {
      const app = request(createApp(webRoot));
      const res = method === 'GET' ? await app.get(path) : await app.post(path);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body).toEqual({ error: 'Not found' });
    },
  );

  it('responds on an API route (replace with your own)', async () => {
    const res = await request(createApp(webRoot)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
  });
});
