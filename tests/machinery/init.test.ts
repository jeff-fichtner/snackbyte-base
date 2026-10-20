// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRawValues } from '../../scripts/lib/env-guard.mjs';

/**
 * Validates the spin-up resolver across all four mode × render combinations,
 * end-to-end. For each, it copies the template to a temp dir, runs `init`, builds,
 * runs the compiled server, and asserts the resolved app behaves correctly and that
 * all template scaffolding (init script, markers, machinery tests) is gone.
 *
 * This is how the template proves every variant without a runtime switch: the choice
 * is resolved into code, then the real artifact is exercised.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

type Mode = 'static' | 'server';
type Render = 'prerender' | 'dynamic';

function setupApp(mode: Mode, render: Render): { dir: string; buildLog: string } {
  const dir = mkdtempSync(join(tmpdir(), `snackbyte-${mode}-${render}-`));
  try {
    return { dir, buildLog: resolveAndBuild(dir, mode, render) };
  } catch (error) {
    // The copy carries a full node_modules; don't strand it when init or the build fails.
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

function resolveAndBuild(dir: string, mode: Mode, render: Render): string {
  cpSync(repoRoot, dir, {
    recursive: true,
    // Exclude .git as a path segment, not a substring — otherwise `/.github` (which
    // contains `/.git`) would be skipped and the workflow file would never be copied. The
    // committed .env is copied (a fresh clone has it); any other local .env.* file is left out
    // (a fresh clone has none): the build loads env files, and one could carry settings this
    // test must not inherit.
    filter: (src) =>
      !src.includes('/node_modules') &&
      !src.includes('/dist') &&
      !/\/\.git(\/|$)/.test(src) &&
      !/\/\.env\.[^/]*$/.test(src),
  });
  cpSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), { recursive: true });

  execFileSync(
    'node',
    ['scripts/init.mjs', `--mode=${mode}`, `--render=${render}`, '--name=demo'],
    {
      cwd: dir,
      stdio: 'ignore',
    },
  );
  // Never let an inherited opt-out hide the config-loader warning the build is checked for.
  const build = spawnSync('node', ['scripts/build.mjs'], {
    cwd: dir,
    env: { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: '' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (build.status !== 0) {
    throw new Error(
      `build failed (${build.error ?? build.signal ?? build.status}):\n${build.stdout}\n${build.stderr}`,
    );
  }
  return `${build.stdout}\n${build.stderr}`;
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

interface Combo {
  mode: Mode;
  render: Render;
  port: number;
}
const COMBOS: Combo[] = [
  { mode: 'server', render: 'prerender', port: 8160 },
  { mode: 'static', render: 'prerender', port: 8161 },
  { mode: 'server', render: 'dynamic', port: 8162 },
  { mode: 'static', render: 'dynamic', port: 8163 },
];

describe.each(COMBOS)('init → $mode / $render app', ({ mode, render, port }) => {
  let dir: string;
  let buildLog: string;
  let child: ChildProcess;

  beforeAll(async () => {
    ({ dir, buildLog } = setupApp(mode, render));
    child = await start(dir, port);
  }, 60_000);
  afterAll(() => {
    child?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // Vite plans to make its native config loader the default; under it, Node itself imports
  // vite.config.ts, and an extensionless relative import fails outright. Vite warns about that
  // today, so a clean build log and a native load together prove the config is ready for it.
  it('builds with no Vite config-loader warning', () => {
    expect(buildLog).not.toMatch(/configLoader/);
  });

  it('loads its Vite config with the native loader', () => {
    // In its own process, with the app's own Vite, as `vite` itself would load it. It prints the
    // dev proxy, which a server app builds from the PORT that src/config.ts exports — so the
    // load evaluated that import — and a static app does not have.
    const load = spawnSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `const { loadConfigFromFile } = await import('vite');
         const r = await loadConfigFromFile({ command: 'build', mode: 'production' },
           'vite.config.ts', process.cwd(), 'silent', undefined, 'native');
         console.log(JSON.stringify(r.config.server?.proxy ?? null));`,
      ],
      { cwd: dir, encoding: 'utf8' },
    );
    expect(load.status, load.stderr).toBe(0);
    const proxy = JSON.parse(load.stdout) as Record<string, string> | null;
    if (mode === 'server') expect(proxy?.['/api']).toMatch(/^http:\/\/localhost:\d+$/);
    else expect(proxy).toBeNull();
  });

  it('serves the frontend', async () => {
    expect((await fetch(`http://localhost:${port}/`)).status).toBe(200);
  });

  it(`${mode === 'server' ? 'exposes' : 'does not expose'} the API`, async () => {
    const api = await fetch(`http://localhost:${port}/api/health`);
    expect(api.status).toBe(200);
    if (mode === 'server') {
      expect(api.headers.get('content-type')).toContain('application/json');
    } else {
      // static: no API route → SPA fallthrough to HTML
      expect(api.headers.get('content-type')).toContain('text/html');
    }
  });

  it(`is ${render}`, () => {
    const html = readFileSync(join(dir, 'dist/index.html'), 'utf8');
    const root = html.match(/<div id="root">(.*?)<\/div>/s)?.[1] ?? '';
    if (render === 'prerender') {
      // prerendered: root contains real rendered markup (an element)
      expect(root).toContain('<main');
      expect(existsSync(join(dir, 'src/web/prerender.ts'))).toBe(true);
    } else {
      // dynamic: no prerender step or entry; root is an empty shell (no rendered
      // element — only the leftover comment placeholder, mounted on the client).
      expect(root).not.toContain('<main');
      expect(existsSync(join(dir, 'src/web/prerender.ts'))).toBe(false);
      expect(existsSync(join(dir, 'scripts/prerender.mjs'))).toBe(false);
    }
  });

  it('removed scaffolding, swapped README, no fingerprints', () => {
    expect(existsSync(join(dir, 'scripts/init.mjs'))).toBe(false);
    expect(existsSync(join(dir, 'SPIN-UP.md'))).toBe(false);
    expect(existsSync(join(dir, 'README.app.md'))).toBe(false);
    // Template-only guidance docs (getting FROM the template TO an app) don't reach
    // the resolved app — they'd be dead weight in its root.
    expect(existsSync(join(dir, 'SUBDIR-LAYOUT.md'))).toBe(false);
    expect(existsSync(join(dir, 'src/routes'))).toBe(mode === 'server');
    // The spec-driven-development workflow does not transfer: the app installs it itself
    // (`specify init`) if it wants it, rather than inheriting the template's copy.
    expect(existsSync(join(dir, '.specify'))).toBe(false);
    expect(existsSync(join(dir, 'specs'))).toBe(false);
    // The resolver takes out the `speckit-*` skills by name and drops `.claude/` only once
    // it is empty — it must never delete an agent config the person wrote before spinning up.
    // So assert the promise (no speckit mirrors), not the stronger claim that `.claude` is
    // always gone: a checkout carrying e.g. `.claude/settings.local.json` keeps the directory,
    // and that is correct behavior rather than a failure.
    expect(existsSync(join(dir, '.claude/skills'))).toBe(false);
    if (existsSync(join(dir, '.claude'))) {
      expect(readdirSync(join(dir, '.claude')).some((e) => e.startsWith('speckit-'))).toBe(false);
    }
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).not.toMatch(/specs\//);
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    expect(readme).not.toMatch(/template|skeleton|Use this template/i);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts.init).toBeUndefined();
    // spec-render only renders specs/*.md, which the app has none of — scripts and the
    // dependency both go, and package.json/package-lock.json stay in sync so `npm ci`
    // (used by CI and the Dockerfile) still installs.
    expect(pkg.scripts['spec:html']).toBeUndefined();
    expect(pkg.scripts['spec:html:watch']).toBeUndefined();
    expect(pkg.devDependencies['@snackbyte/spec-render']).toBeUndefined();
    // app starts its own version line at MAJOR.MINOR 0.1 (the patch is derived from tags by CI,
    // not stored in package.json), not the template's version
    expect(pkg.version).toBe('0.1');
    // package renamed to the app; description is a name-derived placeholder, not the
    // template's description and not blank
    expect(pkg.name).toBe('demo');
    expect(pkg.description).toContain('demo');
    expect(pkg.description).not.toMatch(/template|skeleton/i);
    // package-lock.json is synced — no surviving template name/version fingerprint
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
    expect(lock.name).toBe('demo');
    expect(lock.version).toBe('0.1');
    expect(lock.packages['']?.name).toBe('demo');
    expect(JSON.stringify(lock)).not.toMatch(/snackbyte-base/);
    expect(lock.packages['']?.devDependencies?.['@snackbyte/spec-render']).toBeUndefined();
    expect(lock.packages['node_modules/@snackbyte/spec-render']).toBeUndefined();
    // tests re-tiered: machinery gone, app tests kept, vite config points at tests/app
    expect(existsSync(join(dir, 'tests/machinery'))).toBe(false);
    expect(existsSync(join(dir, 'tests/app'))).toBe(true);
    expect(readFileSync(join(dir, 'vite.config.ts'), 'utf8')).not.toMatch(/tests\/machinery/);
    // the app inherits NO CI: the template runs its own release workflow, but does not hand
    // it to spun-up apps. CI is installed per repo from the release-flow Action's CONSUMING.md,
    // so a shipped copy would just be a staler second copy of that wiring. The now-empty
    // .github/ directory goes with it.
    expect(existsSync(join(dir, '.github/workflows/ci-cd.yml'))).toBe(false);
    expect(existsSync(join(dir, '.github/workflows/ci-cd.yml.disabled'))).toBe(false);
    // dependabot.yml moves the template workflow's pins, so it leaves with that workflow
    expect(existsSync(join(dir, '.github/dependabot.yml'))).toBe(false);
    expect(existsSync(join(dir, '.github'))).toBe(false);
    // environments.json is NOT release-flow-only config — it is app build input
    // (scripts/build.mjs generates src/env.generated.ts from it), so it stays.
    expect(existsSync(join(dir, 'environments.json'))).toBe(true);
    // the page <title> is set to the app name, not the template placeholder
    const html = readFileSync(join(dir, 'src/web/index.html'), 'utf8');
    expect(html).toContain('<title>demo</title>');
    expect(html).not.toContain('<title>App</title>');
    for (const f of ['vite.config.ts', 'src/server.ts', 'scripts/dev.mjs', 'scripts/build.mjs']) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/SPINUP/);
    }
  });

  it("keeps the committed .env as the app's local config, naming its own 1Password item", () => {
    // The committed .env is the local configuration and its documentation: plain config on its
    // `# config:` line, and the reference form a secret takes, with the app's item name filled in.
    const env = readFileSync(join(dir, '.env'), 'utf8');
    expect(findRawValues(env)).toEqual([]);
    expect(env).toMatch(/^# config: PORT$/m);
    expect(env).toMatch(/^PORT=8080$/m);
    expect(env).toContain('op://app-secrets/demo.local/KEY');
    expect(env).toContain('item demo.local in the vault app-secrets');
    expect(env).toContain('op run --env-file=.env -- npm run dev');
    expect(env).not.toMatch(/snackbyte-base/);
    expect(existsSync(join(dir, '.env.example'))).toBe(false);
    // git keeps .env and ignores every other env file; the image build sees none of them
    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf8').split('\n');
    expect(gitignore).toEqual(expect.arrayContaining(['.env*', '!.env']));
    expect(gitignore.filter((line) => line.startsWith('!.env'))).toEqual(['!.env']);
    const dockerignore = readFileSync(join(dir, '.dockerignore'), 'utf8').split('\n');
    expect(dockerignore).toContain('.env*');
    expect(dockerignore.filter((line) => line.startsWith('!.env'))).toEqual([]);
    // the gate and the guard ship with the app, and so does the guard's test
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts['check:env']).toBe('node scripts/check-env-files.mjs');
    expect(pkg.scripts['check:all']).toContain('npm run check:env');
    expect(existsSync(join(dir, 'scripts/check-env-files.mjs'))).toBe(true);
    expect(existsSync(join(dir, 'scripts/lib/env-guard.mjs'))).toBe(true);
    expect(existsSync(join(dir, 'tests/app/env-guard.test.ts'))).toBe(true);
  });

  it('resolved source passes prettier (no stray whitespace from marker removal)', () => {
    const result = spawnSync(
      'npx',
      [
        'prettier',
        '--config',
        'config/.prettierrc.json',
        '--ignore-path',
        'config/.prettierignore',
        '--check',
        'src/**/*.{ts,tsx}',
        'scripts/**/*.mjs',
        'vite.config.ts',
      ],
      { cwd: dir, encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
  });

  it('resolved docs point at no file the app does not have', () => {
    // A doc reference that survives the transfer but whose target does not is a dangling
    // pointer in the app's own README — worse than saying nothing, because it reads as a
    // file the owner has misplaced. Only the markdown-link form is checked: a relative link
    // is unambiguously a file in THIS repo, whereas a backticked name may well be a doc in
    // another repo (`CONSUMING.md` in the release-flow Action, say). So the convention is:
    // link a local doc, backtick a foreign one — which is what makes this guard decidable.
    for (const doc of ['README.md']) {
      const text = readFileSync(join(dir, doc), 'utf8');
      const refs = new Set(
        [...text.matchAll(/\[[^\]]*\]\(([A-Za-z0-9_-]+\.md)\)/g)].map((m) => m[1]),
      );
      for (const ref of refs) {
        expect(existsSync(join(dir, ref)), `${doc} points at missing ${ref}`).toBe(true);
      }
    }
  });

  it('leaves no "snackbyte-base" / template-word fingerprint in resolved metadata + key files', () => {
    // The files most likely to carry a leftover template name/word after resolution.
    for (const rel of [
      'package.json',
      'package-lock.json',
      'README.md',
      'src/web/index.html',
      '.env',
    ]) {
      const text = readFileSync(join(dir, rel), 'utf8');
      expect(text, `${rel} still references snackbyte-base`).not.toMatch(/snackbyte-base/);
    }
    // The resolved README must not carry template/skeleton/spin-up wording.
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).not.toMatch(/skeleton|spin-?up/i);
  });

  it('leaves no spec-driven-development references in the resolved app', () => {
    // The workflow is gone, so nothing shipped may point at it — a `/speckit-*` command or
    // a `.specify/` path in the app's own docs would be an instruction it cannot follow.
    for (const rel of [
      'README.md',
      'DEPLOY.md',
      'package.json',
      '.gitignore',
      '.dockerignore',
      'config/.prettierignore',
    ]) {
      const file = join(dir, rel);
      if (!existsSync(file)) continue;
      expect(readFileSync(file, 'utf8'), `${rel} still references Spec Kit`).not.toMatch(
        /speckit|spec[- ]kit|\.specify|spec-render/i,
      );
    }
  });
});

describe('init requires --name', () => {
  it('exits non-zero and changes nothing when --name is omitted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snackbyte-noname-'));
    cpSync(repoRoot, dir, {
      recursive: true,
      filter: (src) =>
        !src.includes('/node_modules') && !src.includes('/dist') && !/\/\.git(\/|$)/.test(src),
    });
    try {
      const result = spawnSync(
        'node',
        ['scripts/init.mjs', '--mode=server', '--render=prerender'],
        { cwd: dir, encoding: 'utf8' },
      );
      expect(result.status).not.toBe(0);
      // init must NOT have run: its script is still present and the package is untouched.
      expect(existsSync(join(dir, 'scripts/init.mjs'))).toBe(true);
      expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name).toBe(
        'snackbyte-base',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('CI/CD is active in the template repo', () => {
  // The snackbyte-base repo runs its own CI: it ships the workflow live as ci-cd.yml (no
  // .disabled). It validates, versions, and tags itself — but ships NO deploy job (deploy is
  // per-app, copied in from DEPLOY.md at wire-up time).
  it('ships the workflow active in the template source (live *.yml, no .disabled)', () => {
    expect(existsSync(join(repoRoot, '.github/workflows/ci-cd.yml'))).toBe(true);
    expect(existsSync(join(repoRoot, '.github/workflows/ci-cd.yml.disabled'))).toBe(false);
    const workflow = readFileSync(join(repoRoot, '.github/workflows/ci-cd.yml'), 'utf8');
    expect(workflow).toContain('name: ci-cd');
    // no deploy job / deploy provider wiring in the template's own workflow
    expect(workflow).not.toMatch(/^\s*deploy:/m);
    expect(workflow).not.toMatch(/gcloud|run\.googleapis|workload_identity/i);
  });

  // Copies the whole repo incl. node_modules (~150MB), which can exceed the 5s default under
  // load — give it room so the cpSync isn't a flaky timeout.
  it(
    'strips the template’s inherited git tags so the app’s first release mints v0.1.0',
    { timeout: 30000 },
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'snackbyte-tags-'));
      cpSync(repoRoot, dir, {
        recursive: true,
        filter: (src) =>
          !src.includes('/node_modules') && !src.includes('/dist') && !/\/\.git(\/|$)/.test(src),
      });
      cpSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), { recursive: true });
      const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
      try {
        // A clone/fork inherits the template's release tags; reproduce that, then assert init clears
        // them (a "Create from template" repo has none, which is the no-op path also exercised here).
        git('init', '-q');
        git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-qm', 'seed');
        git('tag', 'v1.2.0');
        git('tag', 'v1.2.5');
        expect(execFileSync('git', ['tag', '-l'], { cwd: dir, encoding: 'utf8' }).trim()).not.toBe(
          '',
        );

        execFileSync(
          'node',
          ['scripts/init.mjs', '--mode=static', '--render=dynamic', '--name=demo'],
          { cwd: dir, stdio: 'ignore' },
        );

        expect(execFileSync('git', ['tag', '-l'], { cwd: dir, encoding: 'utf8' }).trim()).toBe('');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
