/**
 * One-time spin-up resolver for this web project. Bakes its choices into the source:
 *
 *   node scripts/init.mjs --render=<prerender|dynamic> --api=<yes|no> --name=<app-name>
 *
 * Every flag is required; there are no defaults. It runs once, against the pristine project (a known
 * state), so it is specific rather than defensive.
 *
 *   --render=prerender  content rendered to real HTML at build time.
 *   --render=dynamic    rendered in the browser; the prerender step and its entry are removed.
 *   --api=yes           the app has a server with an API: the dev server forwards /api to API_URL.
 *   --api=no            no API: the dev proxy and API_URL are removed.
 *   --name              the app's name: the page title, the package name, the 1Password item.
 *
 * After it runs there is no render or API switch left: the project simply is what it is. Changing
 * either later is a code edit, not a flag.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = (p) => resolve(root, p);

const USAGE =
  'Usage: node scripts/init.mjs --render=<prerender|dynamic> --api=<yes|no> --name=<app-name>';
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const problems = [];
if (args.render !== 'prerender' && args.render !== 'dynamic') {
  problems.push('--render must be prerender or dynamic');
}
if (args.api !== 'yes' && args.api !== 'no') problems.push('--api must be yes or no');
if (typeof args.name !== 'string' || args.name.trim() === '') problems.push('--name is required');
if (problems.length > 0) {
  console.error(`${problems.join('\n')}\n${USAGE}`);
  process.exit(1);
}
const { render, api, name } = args;

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

// Render strategy.
resolveMarkers('scripts/build.mjs', 'prerender-only', render === 'prerender');
if (render === 'dynamic') {
  rmSync(path('src/prerender.ts'), { force: true });
  rmSync(path('scripts/prerender.mjs'), { force: true });
  rmSync(path('tests/machinery/prerender.test.ts'), { force: true });
}

// The /api dev proxy and the API_URL it reads.
resolveMarkers('vite.config.ts', 'api-only', api === 'yes');
if (api === 'no') {
  edit('.env', (text) =>
    text
      .replace(/^# config: API_URL$/m, '# config:')
      .replace(/\n# The server the dev server forwards \/api requests to\.\nAPI_URL=.*\n/, ''),
  );
}

// The app's name.
edit('index.html', (text) => text.replace('<title>App</title>', `<title>${name}</title>`));
edit('.env', (text) => text.replaceAll('web-react.local', `${name}.local`));
edit('README.app.md', (text) => text.replaceAll('APP_NAME', name));
for (const rel of ['package.json', 'package-lock.json']) {
  if (!existsSync(path(rel))) continue;
  const json = JSON.parse(readFileSync(path(rel), 'utf8'));
  json.name = name;
  if (json.packages?.['']) json.packages[''].name = name;
  writeFileSync(path(rel), JSON.stringify(json, null, 2) + '\n');
}

console.log(`Resolved the web project: ${render}, ${api === 'yes' ? 'with' : 'without'} an API.`);
