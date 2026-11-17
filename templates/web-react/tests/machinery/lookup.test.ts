// @vitest-environment node
//
// The project reads environments.json and .env from its own folder first and the folder above
// second: standalone it has its own copies; as a part of a larger app it reads the app's one copy.
// And the dev server's /api proxy needs API_URL only when the dev server actually starts.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findUpOne } from '../../scripts/lib/find-up-one.mjs';
import { manifestPath, resolveBuildEnv } from '../../scripts/resolve-env.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const manifest = (name: string) =>
  JSON.stringify({
    environments: [{ name, branch: 'b', isPublicFace: false, noindex: true, tagSuffix: '' }],
  });

describe('own folder first, then the folder above', () => {
  let app: string;
  let part: string;

  beforeEach(() => {
    app = mkdtempSync(join(tmpdir(), 'lookup-'));
    part = join(app, 'web');
    mkdirSync(part);
  });
  afterEach(() => {
    rmSync(app, { recursive: true, force: true });
    delete process.env.APP_ENV_NAME;
  });

  it('finds the project’s own copy first', () => {
    writeFileSync(join(part, 'environments.json'), manifest('own'));
    writeFileSync(join(app, 'environments.json'), manifest('app'));
    expect(manifestPath(part)).toBe(join(part, 'environments.json'));
  });

  it('finds the app’s copy in the folder above when the project has none', () => {
    writeFileSync(join(app, 'environments.json'), manifest('app'));
    expect(manifestPath(part)).toBe(join(app, 'environments.json'));
    process.env.APP_ENV_NAME = 'app';
    expect(resolveBuildEnv(part).name).toBe('app');
  });

  it('stops naming both places when neither has the manifest', () => {
    expect(() => resolveBuildEnv(part)).toThrow(
      `environments.json not found: looked in ${join(part, 'environments.json')} and ${join(app, 'environments.json')}`,
    );
  });

  it('looks no further than the folder above', () => {
    const nested = join(part, 'deeper');
    mkdirSync(nested);
    writeFileSync(join(app, 'environments.json'), manifest('app'));
    expect(findUpOne('environments.json', nested).found).toBeUndefined();
  });

  it('refuses an APP_ENV_NAME the manifest does not list, naming the known ones', () => {
    writeFileSync(join(part, 'environments.json'), manifest('staging'));
    process.env.APP_ENV_NAME = 'qa';
    expect(() => resolveBuildEnv(part)).toThrow(
      "APP_ENV_NAME='qa' is not an environment in environments.json (have: staging)",
    );
  });
});

describe('the dev server needs API_URL; builds and tests do not', () => {
  // Each runs in its own process, as `npm run dev` and `npm run build` run: outside Vitest, whose own
  // Vite server forwards nothing and so never asks for API_URL.
  const outside = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== 'API_URL' && key !== 'VITEST'),
  );
  const runVite = (code: string, env: NodeJS.ProcessEnv) =>
    spawnSync('node', ['--input-type=module', '-e', code], {
      cwd: projectRoot,
      encoding: 'utf8',
      env,
    });
  const startDevServer = `const { createServer } = await import('vite');
    const server = await createServer({ logLevel: 'silent', server: { port: 0 } });
    await server.listen();
    await server.close();`;

  it('refuses to start the dev server without API_URL, naming it', () => {
    const result = runVite(startDevServer, outside);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('API_URL is not set');
  });

  it('starts the dev server with API_URL set', () => {
    const result = runVite(startDevServer, { ...outside, API_URL: 'http://localhost:1' });
    expect(result.status, result.stderr).toBe(0);
  });

  it('builds without API_URL', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'build-no-api-url-'));
    try {
      const result = runVite(
        `const { build } = await import('vite');
         await build({ logLevel: 'silent', build: { outDir: process.env.OUT_DIR } });`,
        { ...outside, OUT_DIR: outDir },
      );
      expect(result.status, result.stderr).toBe(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
