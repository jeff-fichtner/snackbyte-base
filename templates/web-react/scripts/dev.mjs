/**
 * Dev runner. Starts the Vite dev server. Anything after `npm run dev --` is handed to Vite, e.g.
 * `npm run dev -- --host` to open the dev server to other devices on the network.
 */
import './load-env.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const binDir = fileURLToPath(new URL('../node_modules/.bin/', import.meta.url));
/** Resolves a locally-installed CLI binary (Windows uses the .cmd shim). */
const bin = (name) => `${binDir}${name}${process.platform === 'win32' ? '.cmd' : ''}`;

const vite = spawn(bin('vite'), process.argv.slice(2), { stdio: 'inherit', shell: false });
vite.on('exit', (code) => process.exit(code ?? 0));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    vite.kill();
    process.exit(0);
  });
}
