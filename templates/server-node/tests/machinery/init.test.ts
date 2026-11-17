// The resolver for --api=yes and --api=no, end to end: copy the project to a scratch folder,
// resolve it, build it, run its own tests, start the built server, and check it is the server those
// choices describe, already formatted.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
type Api = 'yes' | 'no';

function resolved(api: Api): string {
  const dir = mkdtempSync(join(tmpdir(), `server-node-${api}-`));
  cpSync(projectRoot, dir, {
    recursive: true,
    filter: (src) =>
      !/(^|\/)(node_modules|dist|coverage|public)(\/|$)/.test(src.slice(projectRoot.length)),
  });
  symlinkSync(join(projectRoot, 'node_modules'), join(dir, 'node_modules'));
  execFileSync('node', ['scripts/init.mjs', `--api=${api}`, '--name=demo'], {
    cwd: dir,
    stdio: 'ignore',
  });
  return dir;
}

async function startBuilt(dir: string, port: number): Promise<ChildProcess> {
  const child = spawn('node', ['dist/server.js'], {
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

describe.each([
  { api: 'yes' as Api, port: 8171 },
  { api: 'no' as Api, port: 8172 },
])('init --api=$api', ({ api, port }) => {
  let dir: string;
  let server: ChildProcess;

  beforeAll(async () => {
    dir = resolved(api);
    const build = spawnSync('node', ['scripts/build.mjs'], { cwd: dir, encoding: 'utf8' });
    if (build.status !== 0) throw new Error(`build failed:\n${build.stdout}\n${build.stderr}`);
    mkdirSync(join(dir, 'public'));
    writeFileSync(join(dir, 'public/index.html'), '<!doctype html><div id="root"></div>');
    server = await startBuilt(dir, port);
  }, 120_000);
  afterAll(() => {
    server?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('serves the built web app from public/', async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(await res.text()).toContain('<div id="root">');
  });

  it(`${api === 'yes' ? 'exposes' : 'does not expose'} the API`, async () => {
    const res = await fetch(`http://localhost:${port}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain(
      api === 'yes' ? 'application/json' : 'text/html',
    );
    expect(existsSync(join(dir, 'src/routes'))).toBe(api === 'yes');
  });

  it(`${api === 'yes' ? 'has' : 'has no'} dev process in its manifest`, () => {
    const manifest = JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'));
    expect('dev' in manifest).toBe(api === 'yes');
  });

  it('keeps the smoke test for its choice, and its own tests pass', () => {
    expect(existsSync(join(dir, 'tests/app/server-smoke.test.ts'))).toBe(api === 'yes');
    expect(existsSync(join(dir, 'tests/app/static-smoke.test.ts'))).toBe(api === 'no');
    expect(existsSync(join(dir, 'tests/no-api'))).toBe(false);
    const run = spawnSync(join(dir, 'node_modules/.bin/vitest'), ['run', 'tests/app'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  });

  it('carries the app name and no template name', () => {
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name).toBe('demo');
    expect(JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')).name).toBe('demo');
    const env = readFileSync(join(dir, '.env'), 'utf8');
    expect(env).toContain('op://app-secrets/demo.local/KEY');
    expect(env).not.toContain('server-node');
  });

  it('leaves no marker, needs no formatter, and passes lint and typecheck', () => {
    expect(readFileSync(join(dir, 'src/server.ts'), 'utf8')).not.toMatch(/SPINUP/);
    const bin = (name: string) => join(dir, 'node_modules/.bin', name);
    const prettier = spawnSync(
      bin('prettier'),
      [
        '--config',
        'config/.prettierrc.json',
        '--ignore-path',
        'config/.prettierignore',
        '--check',
        '.',
      ],
      { cwd: dir, encoding: 'utf8' },
    );
    expect(prettier.status, prettier.stdout + prettier.stderr).toBe(0);
    const lint = spawnSync(bin('eslint'), ['.'], { cwd: dir, encoding: 'utf8' });
    expect(lint.status, lint.stdout + lint.stderr).toBe(0);
    const tsc = spawnSync(bin('tsc'), ['--noEmit'], { cwd: dir, encoding: 'utf8' });
    expect(tsc.status, tsc.stdout + tsc.stderr).toBe(0);
  });
});

describe('init refuses incomplete choices', () => {
  it('exits non-zero, naming each problem, and changes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'server-node-refuse-'));
    try {
      cpSync(join(projectRoot, 'scripts'), join(dir, 'scripts'), { recursive: true });
      cpSync(join(projectRoot, 'src'), join(dir, 'src'), { recursive: true });
      const result = spawnSync('node', ['scripts/init.mjs', '--api=maybe'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('--api must be yes or no');
      expect(result.stderr).toContain('--name is required');
      expect(existsSync(join(dir, 'src/routes'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
