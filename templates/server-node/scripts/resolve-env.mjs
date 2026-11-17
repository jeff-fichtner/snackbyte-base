/**
 * Resolves the active environment's facets from environments.json, for the BUILD side.
 *
 * The build learns which environment it is building for from APP_ENV_NAME (a single build-arg).
 * Its facets come from the manifest — never from separate build-args that could drift. When
 * APP_ENV_NAME is unset (local development), there is no deployment to identify, so the `local`
 * identity applies.
 *
 * The manifest is this project's own copy, or, inside an app with several parts, the app's one copy
 * in the folder above (see lib/find-up-one.mjs). Every part of an app resolves the same entry, so they
 * all report the same environment.
 */
import { readFileSync } from 'node:fs';
import { findUpOne } from './lib/find-up-one.mjs';

/** The "no deployment / no baked provenance" identity. */
export const LOCAL = { name: 'local', isPublicFace: false, noindex: true };

/**
 * The path of the environments manifest this project reads. Throws, naming both places looked in,
 * when neither has one.
 *
 * @param {string} [root] the project root to look from (tests pass a scratch folder)
 */
export function manifestPath(root) {
  const { found, candidates } = findUpOne('environments.json', root);
  if (!found) {
    throw new Error(`environments.json not found: looked in ${candidates.join(' and ')}`);
  }
  return found;
}

/**
 * The active environment's identity for this build: the environment named by APP_ENV_NAME resolved
 * against environments.json, or the `local` identity when APP_ENV_NAME is unset. Throws if
 * APP_ENV_NAME names an environment that is not in the manifest (a real misconfiguration).
 *
 * @param {string} [root] the project root to look from (tests pass a scratch folder)
 */
export function resolveBuildEnv(root) {
  const manifest = JSON.parse(readFileSync(manifestPath(root), 'utf8'));
  const name = process.env.APP_ENV_NAME;
  if (!name) return { ...LOCAL };

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
