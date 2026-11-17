// @vitest-environment node
//
// The resolver across render × api, end to end: copy the project to a scratch folder, resolve it,
// build it, and check the result is the project those choices describe, already formatted.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

type Render = 'prerender' | 'dynamic';
type Api = 'yes' | 'no';

function resolved(render: Render, api: Api): string {
  const dir = mkdtempSync(join(tmpdir(), `web-react-${render}-${api}-`));
  cpSync(projectRoot, dir, {
    recursive: true,
    filter: (src) =>
      !/(^|\/)(node_modules|dist|coverage)(\/|$)/.test(src.slice(projectRoot.length)),
  });
  symlinkSync(join(projectRoot, 'node_modules'), join(dir, 'node_modules'));
  execFileSync('node', ['scripts/init.mjs', `--render=${render}`, `--api=${api}`, '--name=demo'], {
    cwd: dir,
    stdio: 'ignore',
  });
  return dir;
}

describe.each([
  { render: 'prerender' as Render, api: 'yes' as Api },
  { render: 'prerender' as Render, api: 'no' as Api },
  { render: 'dynamic' as Render, api: 'yes' as Api },
  { render: 'dynamic' as Render, api: 'no' as Api },
])('init --render=$render --api=$api', ({ render, api }) => {
  let dir: string;

  beforeAll(() => {
    dir = resolved(render, api);
    const build = spawnSync('node', ['scripts/build.mjs'], { cwd: dir, encoding: 'utf8' });
    if (build.status !== 0) throw new Error(`build failed:\n${build.stdout}\n${build.stderr}`);
  }, 120_000);
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it(`is ${render}`, () => {
    const html = readFileSync(join(dir, 'dist/index.html'), 'utf8');
    const root = html.match(/<div id="root">(.*?)<\/div>/s)?.[1] ?? '';
    if (render === 'prerender') {
      expect(root).toContain('<main');
      expect(existsSync(join(dir, 'src/prerender.ts'))).toBe(true);
    } else {
      expect(root).not.toContain('<main');
      expect(existsSync(join(dir, 'src/prerender.ts'))).toBe(false);
      expect(existsSync(join(dir, 'scripts/prerender.mjs'))).toBe(false);
    }
  });

  it(`${api === 'yes' ? 'forwards' : 'does not forward'} /api from the dev server`, () => {
    // Loaded in its own process with the project's own Vite and its native loader, as `vite`
    // loads it; no API_URL is needed to load it, only to start the dev server.
    const load = spawnSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `const { loadConfigFromFile } = await import('vite');
         const r = await loadConfigFromFile({ command: 'serve', mode: 'development' },
           'vite.config.ts', process.cwd(), 'silent', undefined, 'native');
         console.log(JSON.stringify(Object.keys(r.config.server?.proxy ?? {})));`,
      ],
      { cwd: dir, encoding: 'utf8', env: { ...process.env, API_URL: '' } },
    );
    expect(load.status, load.stderr).toBe(0);
    expect(JSON.parse(load.stdout)).toEqual(api === 'yes' ? ['/api'] : []);
    const env = readFileSync(join(dir, '.env'), 'utf8');
    if (api === 'yes') {
      expect(env).toMatch(/^# config: API_URL$/m);
      expect(env).toMatch(/^API_URL=http:\/\/localhost:8080$/m);
    } else {
      expect(env).toMatch(/^# config:$/m);
      expect(env).not.toContain('API_URL=');
      expect(env.endsWith('\n') && !env.endsWith('\n\n')).toBe(true);
    }
  });

  it('carries the app name and no template name', () => {
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain('<title>demo</title>');
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name).toBe('demo');
    expect(JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')).name).toBe('demo');
    const env = readFileSync(join(dir, '.env'), 'utf8');
    expect(env).toContain('op://app-secrets/demo.local/KEY');
    expect(env).not.toContain('web-react');
    expect(readFileSync(join(dir, 'README.app.md'), 'utf8')).not.toContain('APP_NAME');
  });

  it('leaves no marker and needs no formatter', () => {
    for (const rel of ['vite.config.ts', 'scripts/build.mjs']) {
      expect(readFileSync(join(dir, rel), 'utf8')).not.toMatch(/SPINUP/);
    }
    const check = spawnSync(
      join(dir, 'node_modules/.bin/prettier'),
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
    expect(check.status, check.stdout + check.stderr).toBe(0);
  });

  it('still passes lint and typecheck', () => {
    const lint = spawnSync(join(dir, 'node_modules/.bin/eslint'), ['.'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(lint.status, lint.stdout + lint.stderr).toBe(0);
    const tsc = spawnSync(join(dir, 'node_modules/.bin/tsc'), ['--noEmit'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(tsc.status, tsc.stdout + tsc.stderr).toBe(0);
  });
});

describe('init refuses incomplete choices', () => {
  it('exits non-zero, naming each problem, and changes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-react-refuse-'));
    try {
      cpSync(join(projectRoot, 'scripts'), join(dir, 'scripts'), { recursive: true });
      cpSync(join(projectRoot, 'index.html'), join(dir, 'index.html'));
      const result = spawnSync('node', ['scripts/init.mjs', '--render=static'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('--render must be prerender or dynamic');
      expect(result.stderr).toContain('--api must be yes or no');
      expect(result.stderr).toContain('--name is required');
      expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain('<title>App</title>');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
