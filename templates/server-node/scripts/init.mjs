/**
 * One-time spin-up resolver for this server. Bakes its choices into the source:
 *
 *   node scripts/init.mjs --api=<yes|no> --name=<app-name>
 *
 * Every flag is required; there are no defaults. It runs once, against the pristine project (a known
 * state), so it is specific rather than defensive.
 *
 *   --api=yes  the server serves the built web app AND an API under /api (with /api/health and
 *              /api/version to start from), and has a dev process.
 *   --api=no   the server only serves the built web app: src/routes/ and their registration are
 *              removed, the no-API smoke test replaces the API one, and the server has no dev process
 *              (in development the web dev server serves the pages).
 *   --name     the app's name: the package name and the 1Password item.
 *
 * After it runs there is no API switch left: the server simply is what it is. Adding or removing the
 * API later is a code edit, not a flag.
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = (p) => resolve(root, p);

const USAGE = 'Usage: node scripts/init.mjs --api=<yes|no> --name=<app-name>';
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const problems = [];
if (args.api !== 'yes' && args.api !== 'no') problems.push('--api must be yes or no');
if (typeof args.name !== 'string' || args.name.trim() === '') problems.push('--name is required');
if (problems.length > 0) {
  console.error(`${problems.join('\n')}\n${USAGE}`);
  process.exit(1);
}
const { api, name } = args;

/**
 * Resolves `SPINUP:<axis>` blocks in a file: keeps the code (dropping only the marker lines) when
 * the choice applies, or deletes the whole block when it does not. The blocks are laid out so that
 * either result is already formatted.
 */
function resolveMarkers(rel, axis, keep) {
  const file = path(rel);
  let text = readFileSync(file, 'utf8');
  const marker = (edge) => new RegExp(`[ \\t]*(?://|#)\\s*SPINUP:${axis}:${edge}.*\\n`, 'g');
  const block = new RegExp(
    `[ \\t]*(?://|#)\\s*SPINUP:${axis}:start[\\s\\S]*?SPINUP:${axis}:end.*\\n`,
    'g',
  );
  text = keep
    ? text.replace(marker('start'), '').replace(marker('end'), '')
    : text.replace(block, '');
  writeFileSync(file, text);
}

function edit(rel, change) {
  const file = path(rel);
  writeFileSync(file, change(readFileSync(file, 'utf8')));
}

// The API.
resolveMarkers('src/server.ts', 'api-only', api === 'yes');
if (api === 'yes') {
  rmSync(path('tests/no-api'), { recursive: true, force: true });
} else {
  rmSync(path('src/routes'), { recursive: true, force: true });
  rmSync(path('tests/app/server-smoke.test.ts'), { force: true });
  renameSync(path('tests/no-api/static-smoke.test.ts'), path('tests/app/static-smoke.test.ts'));
  rmSync(path('tests/no-api'), { recursive: true, force: true });
  // Without an API there is nothing to run in development: the web dev server serves the pages.
  edit('template.json', (text) => text.replace(/^\s*"dev": .*\n/m, ''));
}

// The app's name.
edit('.env', (text) => text.replaceAll('server-node.local', `${name}.local`));
edit('README.app.md', (text) => text.replaceAll('APP_NAME', name));
for (const rel of ['package.json', 'package-lock.json']) {
  if (!existsSync(path(rel))) continue;
  const json = JSON.parse(readFileSync(path(rel), 'utf8'));
  json.name = name;
  if (json.packages?.['']) json.packages[''].name = name;
  writeFileSync(path(rel), JSON.stringify(json, null, 2) + '\n');
}

console.log(`Resolved the server: ${api === 'yes' ? 'with' : 'without'} an API.`);
