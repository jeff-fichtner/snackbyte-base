/**
 * Dev runner. Starts the server under tsx, restarting it when its source changes.
 */
import './load-env.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const binDir = fileURLToPath(new URL('../node_modules/.bin/', import.meta.url));
/** Resolves a locally-installed CLI binary (Windows uses the .cmd shim). */
const bin = (name) => `${binDir}${name}${process.platform === 'win32' ? '.cmd' : ''}`;

const server = spawn(bin('tsx'), ['watch', 'src/server.ts'], { stdio: 'inherit', shell: false });
server.on('exit', (code) => process.exit(code ?? 0));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.kill();
    process.exit(0);
  });
}
