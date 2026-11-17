/**
 * The standalone check (opt-in; installs from the network, so not part of check:all):
 *
 *   npm run check:standalone              # every template
 *   npm run check:standalone -- web-react # only these
 *
 * Copies each template alone into an empty folder, makes it a git repository (its env-file check reads
 * tracked files), and runs its manifest's `setup` and `check` with {dir} as `.` — proving it installs
 * and passes its own gate with nothing of the hub or another template beside it, as it would in a
 * repository of its own.
 */
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inFolder, readManifest } from './lib/manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = resolve(root, 'templates');
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(templatesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
const BUILT = /(^|\/)(node_modules|dist|coverage|out|bin|obj|public)(\/|$)/;

let failed = 0;
for (const id of ids) {
  const source = resolve(templatesDir, id);
  const manifest = readManifest(source, id);
  const dir = mkdtempSync(join(tmpdir(), `alone-${id}-`));
  try {
    cpSync(source, dir, {
      recursive: true,
      filter: (src) => !BUILT.test(src.slice(source.length)),
    });
    for (const argv of [
      ['init', '-q'],
      ['add', '-A'],
    ]) {
      spawnSync('git', argv, { cwd: dir, stdio: 'ignore' });
    }
    for (const key of ['setup', 'check']) {
      const command = inFolder(manifest[key], '.');
      const run = spawnSync(command, {
        cwd: dir,
        shell: true,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      });
      if (run.status !== 0) {
        throw new Error(`${key} (${command}) failed:\n${(run.stdout + run.stderr).slice(-4000)}`);
      }
    }
    console.log(`✔ ${id}: installs and passes its gate alone`);
  } catch (error) {
    failed += 1;
    console.log(`✖ ${id}: ${error.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
process.exit(failed > 0 ? 1 : 0);
