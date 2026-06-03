// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function setupApp(mode: Mode, render: Render): string {
  const dir = mkdtempSync(join(tmpdir(), `snackbyte-${mode}-${render}-`));
  cpSync(repoRoot, dir, {
    recursive: true,
    // Exclude .git as a path segment, not a substring — otherwise `/.github` (which
    // contains `/.git`) would be skipped and the workflow file would never be copied.
    filter: (src) =>
      !src.includes('/node_modules') && !src.includes('/dist') && !/\/\.git(\/|$)/.test(src),
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
  let child: ChildProcess;

  beforeAll(async () => {
    dir = setupApp(mode, render);
    child = await start(dir, port);
  }, 60_000);
  afterAll(() => {
    child?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
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
    expect(existsSync(join(dir, 'src/routes'))).toBe(mode === 'server');
    // App's spec-dev state matches a fresh `specify init`: tooling + stub stay; the
    // template's own constitution and specs are gone; specs/ is empty and ready.
    expect(existsSync(join(dir, '.specify/memory/constitution.md'))).toBe(false);
    expect(existsSync(join(dir, '.specify/templates/constitution-template.md'))).toBe(true);
    expect(existsSync(join(dir, 'specs/001-template-skeleton'))).toBe(false);
    expect(existsSync(join(dir, 'specs/.gitkeep'))).toBe(true);
    expect(existsSync(join(dir, '.claude/skills'))).toBe(true);
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    expect(readme).not.toMatch(/template|skeleton|Use this template/i);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts.init).toBeUndefined();
    // app starts its own version history at 0.0.0, not the template's version
    expect(pkg.version).toBe('0.0.0');
    // package renamed to the app, template description cleared
    expect(pkg.name).toBe('demo');
    expect(pkg.description).toBe('');
    // package-lock.json is synced — no surviving template name/version fingerprint
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
    expect(lock.name).toBe('demo');
    expect(lock.version).toBe('0.0.0');
    expect(lock.packages['']?.name).toBe('demo');
    expect(JSON.stringify(lock)).not.toMatch(/snackbyte-base/);
    // tests re-tiered: machinery gone, app tests kept, vite config points at tests/app
    expect(existsSync(join(dir, 'tests/machinery'))).toBe(false);
    expect(existsSync(join(dir, 'tests/app'))).toBe(true);
    expect(readFileSync(join(dir, 'vite.config.ts'), 'utf8')).not.toMatch(/tests\/machinery/);
    // the app gets the full auto-release flow (template ships it off), and the workflow
    // carries no template/spin-up/init fingerprint after resolution
    const workflow = readFileSync(join(dir, '.github/workflows/main.yml'), 'utf8');
    expect(workflow).toContain("AUTO_BUMP: 'true'");
    expect(workflow).not.toContain("AUTO_BUMP: 'false'");
    expect(workflow).not.toMatch(/template|spin-?up|resolver|init sets/i);
    // CLAUDE.md is cleaned for the app: no dangling template-plan reference, no
    // "this is a template, don't edit" guard (the app is meant to be edited).
    const claude = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    expect(claude).not.toMatch(/specs\/001-template-skeleton/);
    expect(claude).toContain('/speckit-constitution');
    expect(claude).not.toMatch(/TEMPLATE-GUARD/);
    expect(claude).not.toMatch(/do not edit it to build an app/i);
    // the page <title> is set to the app name, not the template placeholder
    const html = readFileSync(join(dir, 'src/web/index.html'), 'utf8');
    expect(html).toContain('<title>demo</title>');
    expect(html).not.toContain('<title>App</title>');
    for (const f of ['vite.config.ts', 'src/server.ts', 'scripts/dev.mjs', 'scripts/build.mjs']) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/SPINUP/);
    }
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
});
