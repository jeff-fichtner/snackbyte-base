// Composes every combination the hub offers, end to end. For each: copy the repo, run the hub
// resolver, build the production layout with the app's root `build`, start it with the root `start`,
// and check the app behaves as its choices say and carries nothing of the hub. This is how the hub
// proves every combination without a runtime switch: the choice is resolved into files, then the
// real result is exercised.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRawValues } from '../../templates/web-react/scripts/lib/env-guard.mjs';
import {
  freshCopy,
  linkInstalls,
  npm,
  remove,
  repoRoot,
  runInit,
  startGroup,
  stop,
  waitFor,
} from './helpers';

type Api = 'node' | 'dotnet' | 'none';
type Render = 'prerender' | 'dynamic';
interface Combo {
  api: Api;
  render: Render;
  port: number;
  checkAll: boolean;
}

// The root check runs once per API choice; it runs every part's whole gate, so not for every combo.
const COMBOS: Combo[] = [
  { api: 'node', render: 'prerender', port: 8260, checkAll: true },
  { api: 'node', render: 'dynamic', port: 8261, checkAll: false },
  { api: 'none', render: 'prerender', port: 8262, checkAll: false },
  { api: 'none', render: 'dynamic', port: 8263, checkAll: true },
  { api: 'dotnet', render: 'prerender', port: 8264, checkAll: true },
  { api: 'dotnet', render: 'dynamic', port: 8265, checkAll: false },
];

/** The template each server choice composes into server/. */
const SERVER: Record<Api, string> = {
  node: 'server-node',
  dotnet: 'server-dotnet',
  none: 'server-node',
};

/**
 * What /api/version reports in a local start: each server's own notion of a production run. The Node
 * server reports the dev version unless NODE_ENV or CI says otherwise; the C# server's host
 * environment is Production outside a Development launch profile.
 */
const LOCAL_VERSION: Record<Api, string> = { node: '0.0.0-dev', dotnet: '0.0.0', none: '' };

const read = (dir: string, rel: string) => readFileSync(join(dir, rel), 'utf8');
const json = (dir: string, rel: string) => JSON.parse(read(dir, rel));

describe.each(COMBOS)('--api=$api --render=$render', ({ api, render, port, checkAll }) => {
  const hasApi = api !== 'none';
  let dir: string;
  let server: ChildProcess;

  beforeAll(async () => {
    dir = freshCopy(`hub-${api}-${render}`);
    const init = runInit(dir, [`--api=${api}`, `--render=${render}`, '--name=demo']);
    if (init.status !== 0) throw new Error(`init failed:\n${init.stdout}\n${init.stderr}`);
    linkInstalls(dir, { web: 'web-react', server: SERVER[api] });
    // Never let an inherited opt-out hide the config-loader warning the build is checked for.
    const build = npm(dir, ['run', 'build'], {
      ...process.env,
      VITE_CONFIG_NATIVE_IGNORE_WARNING: '',
    });
    if (build.status !== 0) throw new Error(`build failed:\n${build.stdout}\n${build.stderr}`);
    expect(build.stdout + build.stderr).not.toMatch(/configLoader/);
    // Run as a local start, not a deployed one: without the CI and NODE_ENV a build server sets,
    // which would make the Node server report the deploy's version instead of the dev one.
    const local = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== 'CI' && key !== 'NODE_ENV'),
    );
    server = startGroup(dir, 'npm', ['start'], { ...local, PORT: String(port) });
    await waitFor(`http://localhost:${port}/`);
  });
  afterAll(() => {
    stop(server);
    remove(dir);
  });

  it('serves the web app, and any client-side route', async () => {
    for (const path of ['/', '/some/client/route']) {
      const res = await fetch(`http://localhost:${port}${path}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<div id="root"');
    }
  });

  it(`is ${render}`, () => {
    const html = read(dir, 'web/dist/index.html');
    const root = html.match(/<div id="root">(.*?)<\/div>/s)?.[1] ?? '';
    if (render === 'prerender') expect(root).toContain('<main');
    else expect(root).not.toContain('<main');
    expect(existsSync(join(dir, 'web/src/prerender.ts'))).toBe(render === 'prerender');
  });

  it(`${hasApi ? 'exposes' : 'does not expose'} the API`, async () => {
    const res = await fetch(`http://localhost:${port}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain(hasApi ? 'application/json' : 'text/html');
    if (hasApi) {
      const version = await (await fetch(`http://localhost:${port}/api/version`)).json();
      expect(version).toEqual({
        number: LOCAL_VERSION[api],
        commit: 'dev',
        buildDate: 'dev',
        environment: 'local',
      });
    }
  });

  it('marks the local build noindex, as every non-public environment is', async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
  });

  it('has a web part and a server part, and nothing of the hub', () => {
    for (const rel of ['web', 'server', 'scripts/dev.mjs', 'scripts/copy-web.mjs']) {
      expect(existsSync(join(dir, rel)), rel).toBe(true);
    }
    for (const rel of [
      'templates',
      'hub',
      'specs',
      '.specify',
      'CLAUDE.md',
      'SPIN-UP.md',
      'SUBDIR-LAYOUT.md',
      '.github',
      '.claude/skills',
      'config',
      'eslint.config.js',
      'tsconfig.json',
      'vitest.config.ts',
    ]) {
      expect(existsSync(join(dir, rel)), rel).toBe(false);
    }
    for (const part of ['web', 'server']) {
      for (const rel of [
        'template.json',
        'README.app.md',
        '.env',
        'environments.json',
        'scripts/init.mjs',
        'tests/machinery',
        'tests/no-api',
      ]) {
        expect(existsSync(join(dir, part, rel)), `${part}/${rel}`).toBe(false);
      }
      expect(existsSync(join(dir, part, 'README.md')), `${part}/README.md`).toBe(true);
    }
    expect(existsSync(join(dir, 'server/src/routes'))).toBe(api === 'node');
    expect(existsSync(join(dir, 'server/Api.sln'))).toBe(api === 'dotnet');
  });

  it('roots the app: version 0.1, no dependencies, a script per part', () => {
    const pkg = json(dir, 'package.json');
    expect(pkg.name).toBe('demo');
    expect(pkg.version).toBe('0.1');
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.devDependencies).toBeUndefined();
    expect(Object.keys(pkg.scripts)).toEqual(
      expect.arrayContaining([
        'setup',
        'setup:web',
        'setup:server',
        'dev',
        'build',
        'build:web',
        'build:server',
        'start',
        'check:env',
        'check:all',
      ]),
    );
    // A part's command never shares a shell with another part's, so a `cd` cannot leak.
    expect(pkg.scripts.setup).toBe('npm run setup:web && npm run setup:server');
    expect(pkg.scripts.build).toMatch(/^npm run build:web && npm run build:server && node scripts/);
    expect('dev:web' in pkg.scripts).toBe(true);
    expect('dev:server' in pkg.scripts).toBe(hasApi);
    const lock = json(dir, 'package-lock.json');
    expect(lock.packages['']).toMatchObject({ name: 'demo', version: '0.1' });
    expect(Object.keys(lock.packages)).toEqual(['']);
    expect(json(dir, 'web/package.json').name).toBe('demo-web');
    expect(json(dir, 'web/package-lock.json').name).toBe('demo-web');
    if (api !== 'dotnet') expect(json(dir, 'server/package.json').name).toBe('demo-server');
  });

  it("holds the app's one .env, naming its own 1Password item", () => {
    const env = read(dir, '.env');
    expect(findRawValues(env)).toEqual([]);
    expect(env).toMatch(hasApi ? /^# config: PORT API_URL$/m : /^# config: PORT$/m);
    expect(env).toMatch(/^PORT=8080$/m);
    if (hasApi) expect(env).toMatch(/^API_URL=http:\/\/localhost:8080$/m);
    else expect(env).not.toContain('API_URL');
    expect(env).toContain('op://app-secrets/demo.local/KEY');
    expect(env).toContain('item demo.local in the vault app-secrets');
    expect(env).toContain('op run --env-file=.env -- npm run dev');
    expect(read(dir, 'environments.json')).toBe(read(repoRoot, 'environments.json'));
    const gitignore = read(dir, '.gitignore').split('\n');
    expect(gitignore).toEqual(expect.arrayContaining(['.env*', '!.env']));
    expect(read(dir, '.dockerignore').split('\n')).toContain('**/.env*');
  });

  it('stamps the template it came from, with no version outside git', () => {
    expect(json(dir, '.template.json')).toEqual({ template: 'snackbyte-base', version: null });
  });

  it('gets the image recipe for its server, and the Cloud Run deploy files', () => {
    const recipe = api === 'dotnet' ? 'Dockerfile.dotnet' : 'Dockerfile.node';
    expect(read(dir, 'Dockerfile')).toBe(read(repoRoot, `hub/files/${recipe}`));
    for (const file of ['cloudbuild.yaml', 'DEPLOY.md']) {
      expect(read(dir, file)).toBe(read(repoRoot, `templates/deploy-cloud-run/${file}`));
    }
  });

  it('carries no template name, template wording, marker or spec-workflow reference', () => {
    const readme = read(dir, 'README.md');
    expect(readme).not.toMatch(/template|skeleton|spin-?up/i);
    expect(readme).toContain('[`web/`](web/README.md)');
    for (const rel of [
      'package.json',
      'package-lock.json',
      'README.md',
      'web/index.html',
      'web/package.json',
      'server/package.json',
      '.env',
    ].filter((rel) => existsSync(join(dir, rel)))) {
      expect(read(dir, rel), rel).not.toMatch(/snackbyte-base|web-react|server-node|server-dotnet/);
    }
    for (const rel of [
      'README.md',
      'DEPLOY.md',
      'package.json',
      '.gitignore',
      '.dockerignore',
      'web/README.md',
      'server/README.md',
    ]) {
      expect(read(dir, rel), rel).not.toMatch(/speckit|spec[- ]kit|\.specify|spec-render/i);
    }
    for (const rel of [
      'web/vite.config.ts',
      'web/scripts/build.mjs',
      'server/src/server.ts',
      'server/src/Api/Program.cs',
    ].filter((rel) => existsSync(join(dir, rel)))) {
      expect(read(dir, rel), rel).not.toMatch(/SPINUP/);
    }
  });

  it('points at no local doc the app does not have', () => {
    // Only the markdown-link form is checked: a relative link is unambiguously a file in this repo,
    // whereas a backticked name may be a doc in another repo. Link a local doc, backtick a foreign one.
    for (const doc of ['README.md', 'web/README.md', 'server/README.md']) {
      const base = join(dir, doc, '..');
      const refs = [...read(dir, doc).matchAll(/\]\(([A-Za-z0-9_./-]+\.md)\)/g)].map((m) => m[1]);
      for (const ref of refs) expect(existsSync(join(base, ref)), `${doc} → ${ref}`).toBe(true);
    }
  });

  it.runIf(checkAll)('passes its root check: the env files, then every part’s gate', () => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '-A'], { cwd: dir });
    const check = npm(dir, ['run', 'check:all']);
    expect(check.status, check.stdout.slice(-4000) + check.stderr.slice(-4000)).toBe(0);
    expect(check.stdout).toContain('check:env OK: 1 tracked env file(s)');
  });
});

describe.each([
  { api: 'node' as Api, vitePort: 8270, apiPort: 8271 },
  { api: 'dotnet' as Api, vitePort: 8272, apiPort: 8273 },
])('the root dev command (--api=$api)', ({ api, vitePort, apiPort }) => {
  let dir: string;
  let dev: ChildProcess;

  beforeAll(() => {
    dir = freshCopy(`hub-dev-${api}`);
    const init = runInit(dir, [`--api=${api}`, '--render=dynamic', '--name=demo']);
    if (init.status !== 0) throw new Error(init.stderr);
    linkInstalls(dir, { web: 'web-react', server: SERVER[api] });
  });
  afterAll(() => {
    stop(dev);
    remove(dir);
  });

  it('starts every part together; the web dev server forwards /api to the server', async () => {
    // The environment wins over .env, so the test picks its own ports.
    const log = join(dir, 'dev.log');
    dev = startGroup(
      dir,
      'npm',
      ['run', 'dev', '--', '--port', String(vitePort), '--strictPort'],
      { ...process.env, PORT: String(apiPort), API_URL: `http://localhost:${apiPort}` },
      log,
    );
    // The C# server restores and compiles before it listens, so it gets longer to come up. On a
    // timeout, the dev processes' own output says why.
    try {
      await waitFor(`http://localhost:${vitePort}/api/health`, 120_000);
    } catch (error) {
      throw new Error(`${(error as Error).message}\n--- npm run dev ---\n${read(dir, 'dev.log')}`);
    }
    const res = await fetch(`http://localhost:${vitePort}/api/health`);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(((await res.json()) as { status: string }).status).toBe('ok');
  }, 150_000);
});

describe('the repo before composing', () => {
  it('holds no stamp of its own', () => {
    expect(existsSync(join(repoRoot, '.template.json'))).toBe(false);
  });

  it('keeps its own CI workflow (an app gets none)', () => {
    const workflows = readdirSync(join(repoRoot, '.github/workflows'));
    expect(workflows).toContain('ci-cd.yml');
    const workflow = read(repoRoot, '.github/workflows/ci-cd.yml');
    expect(workflow).not.toMatch(/^\s*deploy:/m);
    expect(workflow).not.toMatch(/gcloud|run\.googleapis|workload_identity/i);
  });
});
