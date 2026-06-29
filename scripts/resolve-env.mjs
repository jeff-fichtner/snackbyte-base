/**
 * Resolves the active environment's facets from environments.json, for the BUILD side
 * (vite.config.ts, scripts/prerender.mjs, scripts/build.mjs). The server-side typed reader is
 * src/environments.ts; this is its build-tooling counterpart, reading the same file so the
 * baked identity matches what the server reports.
 *
 * The build learns which environment it is building for from APP_ENV_NAME (a single build-arg).
 * Its facets come from the manifest — never from separate build-args that could drift. When
 * APP_ENV_NAME is unset (local `npm run dev`), there is no deployment to identify, so the
 * `local` fallback applies. This `local` literal MUST mirror src/environments.ts's LOCAL.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The "no deployment / no baked provenance" identity. Mirrors LOCAL in src/environments.ts. */
export const LOCAL = { name: 'local', isPublicFace: false, noindex: true };

/**
 * The active environment's identity for this build: the environment named by APP_ENV_NAME
 * resolved against environments.json, or the `local` fallback when APP_ENV_NAME is unset.
 * Throws if APP_ENV_NAME names an environment that is not in the manifest (a real misconfig).
 */
export function resolveBuildEnv() {
  const name = process.env.APP_ENV_NAME;
  if (!name) return { ...LOCAL };

  const manifestUrl = new URL('../environments.json', import.meta.url);
  const manifest = JSON.parse(readFileSync(fileURLToPath(manifestUrl), 'utf8'));
  const env = manifest.environments.find((e) => e.name === name);
  if (!env) {
    throw new Error(
      `APP_ENV_NAME='${name}' is not an environment in environments.json (have: ` +
        manifest.environments.map((e) => e.name).join(', ') +
        ')',
    );
  }
  return { name: env.name, isPublicFace: env.isPublicFace, noindex: env.noindex };
}
