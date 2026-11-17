/**
 * Runs one manifest command for every template under templates/, from this repo's root:
 *
 *   node hub/templates.mjs setup   # install every template's dependencies
 *   node hub/templates.mjs check   # run every template's own gate
 *
 * Each template's command is the one in its template.json, with {dir} filled in as
 * templates/<id> — the same command a composed app's root runs with {dir} as the part's folder.
 * Templates run one at a time, and the first failure stops the run.
 */
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inFolder, readManifest } from './lib/manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key = process.argv[2];
if (key !== 'setup' && key !== 'check') {
  console.error('Usage: node hub/templates.mjs <setup|check>');
  process.exit(1);
}

const ids = readdirSync(resolve(root, 'templates'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const id of ids) {
  const manifest = readManifest(resolve(root, 'templates', id), id);
  const command = inFolder(manifest[key], `templates/${id}`);
  console.log(`\n▶ ${id}: ${command}`);
  const run = spawnSync(command, { cwd: root, stdio: 'inherit', shell: true });
  if (run.status !== 0) {
    console.error(`\n✖ ${id}: ${key} failed`);
    process.exit(run.status ?? 1);
  }
}
console.log(`\n✔ ${key}: ${ids.join(', ')}`);
