// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Validates the spin-up resolver and BOTH resolved modes end-to-end. For each mode it
 * copies the template to a temp dir, runs `init --mode=X`, builds, runs the compiled
 * server, and asserts the resolved app behaves correctly — and that all template
 * scaffolding (init script, markers, machinery tests) is gone.
 *
 * This is how the template proves both modes without a runtime mode flag: the mode is
 * resolved into code, then the real artifact is exercised.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function setupApp(mode: 'static' | 'server') {
  const dir = mkdtempSync(join(tmpdir(), `snackbyte-${mode}-`));
  // Copy the template, excluding heavy/regenerable dirs.
  cpSync(repoRoot, dir, {
    recursive: true,
    filter: (src) =>
      !src.includes('/node_modules') && !src.includes('/dist') && !src.includes('/.git'),
  });
  // Reuse the template's node_modules via symlink-free install shortcut: copy it.
  cpSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), { recursive: true });

  execFileSync('node', ['scripts/init.mjs', `--mode=${mode}`], { cwd: dir, stdio: 'ignore' });
  execFileSync('node', ['scripts/build.mjs'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

async function start(dir: string, port: number): Promise<ChildProcess> {
  const child = spawn('npm', ['run', 'start'], {
    cwd: dir,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 10_000;
  for (;;) {
    if (Date.now() > deadline) {
      child.kill();
      throw new Error('server did not start');
    }
    try {
      if ((await fetch(`http://localhost:${port}/`)).ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

describe('init → server app', () => {
  let dir: string;
  let child: ChildProcess;
  const port = 8160;
  beforeAll(async () => {
    dir = setupApp('server');
    child = await start(dir, port);
  }, 60_000);
  afterAll(() => {
    child?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('serves the frontend and the API', async () => {
    expect((await fetch(`http://localhost:${port}/`)).status).toBe(200);
    const api = await fetch(`http://localhost:${port}/api/health`);
    expect(api.status).toBe(200);
    expect(api.headers.get('content-type')).toContain('application/json');
  });

  it('removed all template scaffolding and swapped in the app README', () => {
    expect(existsSync(join(dir, 'scripts/init.mjs'))).toBe(false);
    expect(existsSync(join(dir, 'SPIN-UP.md'))).toBe(false);
    expect(existsSync(join(dir, 'README.app.md'))).toBe(false);
    expect(existsSync(join(dir, 'src/routes'))).toBe(true); // server keeps routes
    // No template fingerprints survive into the app's README or package.json.
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    expect(readme).not.toMatch(/template|skeleton|Use this template/i);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg.description ?? '').not.toMatch(/template|skeleton/i);
    expect(pkg.scripts.init).toBeUndefined();
    // No template/skeleton/SPINUP fingerprints in shipped config files.
    for (const f of ['vite.config.ts', 'src/server.ts', 'scripts/dev.mjs']) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/template|skeleton|SPINUP/i);
    }
  });
});

describe('init → static app', () => {
  let dir: string;
  let child: ChildProcess;
  const port = 8161;
  beforeAll(async () => {
    dir = setupApp('static');
    child = await start(dir, port);
  }, 60_000);
  afterAll(() => {
    child?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('serves the frontend with no API', async () => {
    expect((await fetch(`http://localhost:${port}/`)).status).toBe(200);
    const api = await fetch(`http://localhost:${port}/api/health`);
    expect(api.status).toBe(200);
    expect(api.headers.get('content-type')).toContain('text/html'); // SPA fallthrough
  });

  it('removed routes and scaffolding', () => {
    expect(existsSync(join(dir, 'src/routes'))).toBe(false);
    expect(existsSync(join(dir, 'scripts/init.mjs'))).toBe(false);
  });
});
