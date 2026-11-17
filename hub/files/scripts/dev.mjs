/**
 * Dev runner for the whole app. Loads the app's .env once, then starts every part's dev process —
 * each root script named `dev:<part>` in package.json — together, and stops them all when any one
 * stops. Anything after `npm run dev --` goes to the web part's dev server (e.g. `--host` to open
 * it to other devices on the network).
 *
 * .env is committed. Any secret it carries is a 1Password reference (op://…) that only
 * `op run --env-file=.env -- npm run dev` resolves; started without op run, this stops at startup
 * and names the unresolved variable rather than handing a reference to the app as a credential.
 * A variable already set in the environment wins over the file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { assertNoOpReferences } from './lib/env-guard.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
assertNoOpReferences(process.env, 'op run --env-file=.env -- npm run dev');

const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
const parts = Object.keys(scripts).filter((name) => name.startsWith('dev:'));
const passThrough = process.argv.slice(2);

const children = parts.map((script) => {
  const args = ['run', script, ...(script === 'dev:web' && passThrough.length ? ['--', ...passThrough] : [])];
  // npm is a .cmd shim on Windows, which only a shell can start.
  const child = spawn('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => {
    for (const other of children) {
      if (other !== child) other.kill();
    }
    process.exit(code ?? 0);
  });
  return child;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill();
    process.exit(0);
  });
}
