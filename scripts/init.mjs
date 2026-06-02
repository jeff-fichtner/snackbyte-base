/**
 * One-time spin-up resolver. Bakes the app into a single deploy mode and removes all
 * template scaffolding — including itself. Run once, right after creating a repo from
 * this template:
 *
 *   node scripts/init.mjs --mode=<static|server> [--name=<app-name>]
 *
 * It is intentionally specific and non-defensive: it runs once against the pristine
 * template (a known state), then deletes itself, so it never sees a modified repo.
 *
 *   static → serves a prerendered frontend, no API. Removes routes, the dev API
 *            proxy, and the dev API process.
 *   server → serves the frontend AND an Express API under /api.
 *
 * After it runs there is no "mode" concept left: the app simply is what it is.
 * Switching later is a documented code edit (see the template's docs), not a flag.
 */
import { readFileSync, writeFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = (p) => resolve(root, p);

// ---- args ------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const USAGE =
  'Usage: node scripts/init.mjs --mode=<static|server> --render=<prerender|dynamic> [--name=<app-name>]';
const mode = args.mode;
const render = args.render;
if (mode !== 'static' && mode !== 'server') {
  console.error(USAGE);
  process.exit(1);
}
if (render !== 'prerender' && render !== 'dynamic') {
  console.error(USAGE);
  process.exit(1);
}

// ---- marker resolution -----------------------------------------------------
// Resolve `SPINUP:<axis>-only` blocks: keep the code (strip just the marker comments)
// when the app is that variant, or delete the whole block when it isn't.
function resolveMarkers(rel, axis, keep) {
  const file = path(rel);
  if (!existsSync(file)) return;
  let text = readFileSync(file, 'utf8');
  const start = new RegExp(`[ \\t]*(?://|#)\\s*SPINUP:${axis}:start.*\\n`, 'g');
  const end = new RegExp(`[ \\t]*(?://|#)\\s*SPINUP:${axis}:end.*\\n`, 'g');
  const block = new RegExp(
    `[ \\t]*(?://|#)\\s*SPINUP:${axis}:start[\\s\\S]*?SPINUP:${axis}:end.*\\n`,
    'g',
  );
  text = keep ? text.replace(start, '').replace(end, '') : text.replace(block, '');
  writeFileSync(file, text);
}

// server-only axis (across these files); prerender-only axis (in build.mjs).
for (const rel of ['src/server.ts', 'vite.config.ts', 'scripts/dev.mjs']) {
  resolveMarkers(rel, 'server-only', mode === 'server');
}
resolveMarkers('scripts/build.mjs', 'prerender-only', render === 'prerender');

// ---- static-only deletions -------------------------------------------------
if (mode === 'static') {
  rmSync(path('src/routes'), { recursive: true, force: true });
}

// ---- dynamic-only deletions (no prerender step) ----------------------------
if (render === 'dynamic') {
  rmSync(path('src/web/prerender.ts'), { force: true });
  rmSync(path('scripts/prerender.mjs'), { force: true });
}

// ---- re-tier tests ---------------------------------------------------------
// The template proves its own plumbing in tests/machinery (deleted now). The app
// keeps tests/app: an example plus the smoke test matching its mode. Vitest is
// pointed at tests/app.
rmSync(path('tests/machinery'), { recursive: true, force: true });
if (mode === 'server') {
  rmSync(path('tests/app/static-smoke.test.ts'), { force: true });
} else {
  rmSync(path('tests/app/server-smoke.test.ts'), { force: true });
}
{
  const cfg = path('vite.config.ts');
  let text = readFileSync(cfg, 'utf8');
  text = text.replace(/tests\/machinery\//g, 'tests/app/');
  writeFileSync(cfg, text);
}

// ---- rename the package ----------------------------------------------------
if (typeof args.name === 'string') {
  const pkgPath = path('package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = args.name;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

// ---- remove the init script line + template description --------------------
const pkgPath = path('package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
delete pkg.scripts.init;
pkg.description = '';
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// ---- swap in the forward-facing app README, drop template docs -------------
// The app gets its own README (no template/skeleton language); the template README
// and this handoff guide are removed.
const appName = typeof args.name === 'string' ? args.name : pkg.name;
const appReadme = readFileSync(path('README.app.md'), 'utf8').replace(/APP_NAME/g, appName);
writeFileSync(path('README.md'), appReadme);
rmSync(path('README.app.md'), { force: true });
for (const rel of ['SPIN-UP.md']) {
  if (existsSync(path(rel))) rmSync(path(rel), { force: true });
}

// Remove the template's own constitution. The Spec Kit tooling (.specify/) stays so
// the app does spec-driven development, but the populated constitution is about
// building the template — not this app. Deleting it lets the app run
// /speckit-constitution to write its own (the command recreates the file from
// .specify/templates/constitution-template.md when it's missing).
rmSync(path('.specify/memory/constitution.md'), { force: true });

// ---- tidy formatting -------------------------------------------------------
// Deleting marker blocks can leave stray blank lines; reformat so the quality gate
// passes cleanly on the resolved app.
const prettierBin = path(`node_modules/.bin/prettier${process.platform === 'win32' ? '.cmd' : ''}`);
spawnSync(
  prettierBin,
  [
    '--config',
    'config/.prettierrc.json',
    '--ignore-path',
    'config/.prettierignore',
    '--write',
    'src/**/*.{ts,tsx}',
    'scripts/**/*.mjs',
    'vite.config.ts',
  ],
  { cwd: root, stdio: 'ignore' },
);

console.log(`Initialized as a ${mode} / ${render} app named "${appName}".`);
console.log('Removed template scaffolding. This repo is now your app.');

// ---- self-delete (last) ----------------------------------------------------
unlinkSync(fileURLToPath(import.meta.url));
