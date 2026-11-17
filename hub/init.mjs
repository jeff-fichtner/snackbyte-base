/**
 * The hub's one-time spin-up resolver. Composes this copy of snackbyte-base into an app, in place,
 * from the templates under templates/, then removes itself and everything else that is not the app:
 *
 *   npm run init -- --api=<node|none> --render=<prerender|dynamic> --name=<repo-slug>
 *
 * Every choice is required; there are no defaults (they are identity decisions, made deliberately).
 * Every choice and every template it needs is checked before any file changes, so a refused run
 * leaves the copy untouched. It needs nothing installed: only Node's own modules.
 *
 * The app it leaves has a web/ part and a server/ part, each its template resolved, and the files
 * that belong to the combination at its root: package.json (the version line and the scripts that
 * set up, develop, build, start and check every part), the one .env and environments.json every part
 * reads, the Dockerfile for its server, the deploy files, its README and .template.json.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlags, plan } from './lib/plan.mjs';
import { compose } from './lib/compose.mjs';
import { findTemplateVersion, TEMPLATE } from './lib/stamp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const composition = plan(root, parseFlags(process.argv.slice(2)));
if (composition.problems.length > 0) {
  console.error(`${composition.problems.join('\n')}\n${composition.usage}`);
  process.exit(1);
}

// Found from the untouched tree, before anything moves.
const { version, why } = findTemplateVersion(root);
compose(root, composition, version);

const { name, parts } = composition;
const server = parts.find((p) => p.role === 'server');
console.log(`Composed "${name}": ${parts.map((p) => `${p.role} ${p.option}`).join(', ')}.`);
if (version === null) {
  console.warn(
    `Note: could not tell which ${TEMPLATE} version this repo was made from (${why}).\n` +
      '      .template.json records "version": null; set it if you know it (no leading v).',
  );
}
console.log('');
console.log('Next:');
console.log('  1. Install every part:  npm ci && npm run setup');
console.log('  2. Verify:              npm run check:all  &&  npm run dev');
console.log('  3. Commit this spin-up.');
console.log('  4. This app ships no CI workflow. Add the release flow at the release-flow step of');
console.log("     project-setup's SETUP-CHECKLIST.md; CONSUMING.md in");
console.log('     jeff-fichtner/snackbyte-release-flow-action owns its wiring (Recipe A plus');
console.log('     "Build once" for an app, the SHA pin, the repo settings).');
console.log(`  5. A secret goes in 1Password (vault app-secrets, item ${name}.local) and`);
console.log('     .env holds only its reference: the header of .env says how.');
if (server && !server.hasApi) {
  console.log('  (No API: `npm run dev` runs the web dev server alone.)');
}
