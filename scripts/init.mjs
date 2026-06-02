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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = (p) => resolve(root, p);

// ---- args ------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const mode = args.mode;
if (mode !== 'static' && mode !== 'server') {
  console.error('Usage: node scripts/init.mjs --mode=<static|server> [--name=<app-name>]');
  process.exit(1);
}

// ---- marker resolution -----------------------------------------------------
// Files containing `SPINUP:server-only` blocks. For server we keep the code (strip
// the marker comments); for static we delete the whole block.
const MARKER_FILES = ['src/server.ts', 'vite.config.ts', 'scripts/dev.mjs'];
const START = /[ \t]*(?:\/\/|#)\s*SPINUP:server-only:start.*\n/g;
const END = /[ \t]*(?:\/\/|#)\s*SPINUP:server-only:end.*\n/g;
const BLOCK = /[ \t]*(?:\/\/|#)\s*SPINUP:server-only:start[\s\S]*?SPINUP:server-only:end.*\n/g;

for (const rel of MARKER_FILES) {
  const file = path(rel);
  let text = readFileSync(file, 'utf8');
  text = mode === 'server' ? text.replace(START, '').replace(END, '') : text.replace(BLOCK, '');
  writeFileSync(file, text);
}

// ---- static-only deletions -------------------------------------------------
if (mode === 'static') {
  rmSync(path('src/routes'), { recursive: true, force: true });
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

console.log(`Initialized as a ${mode} app named "${appName}".`);
console.log('Removed template scaffolding. This repo is now your app.');

// ---- self-delete (last) ----------------------------------------------------
unlinkSync(fileURLToPath(import.meta.url));
