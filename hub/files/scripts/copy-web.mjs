/**
 * Places the web part's build where the server serves it from, completing the production layout
 * the image also builds:
 *
 *   node scripts/copy-web.mjs <web build> <server web root>
 *
 * The server web root is replaced, not merged, so a file the web build no longer produces is not
 * served from a stale copy.
 */
import { cpSync, existsSync, rmSync } from 'node:fs';

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error('Usage: node scripts/copy-web.mjs <web build> <server web root>');
  process.exit(1);
}
if (!existsSync(from)) {
  console.error(`${from} does not exist: build the web part first.`);
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`Placed ${from} at ${to}.`);
