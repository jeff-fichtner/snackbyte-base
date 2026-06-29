/**
 * The environments manifest reader.
 *
 * `environments.json` at the app root is the single source of truth for the release
 * flow. This module gives Node code (build tooling, the server) a typed view of it.
 * The version derivation reads the same file from bash via `node -p`, so every consumer
 * agrees.
 *
 * The file is read from the working directory (like the dist/ lookup in server.ts) rather
 * than imported, so the same path works whether this runs from source or compiled, and so
 * the server build (rootDir: src) need not reach a JSON file outside src/.
 *
 * Tag format parts (the one source for the derivation's render AND its read-back parser,
 * which must be generated from these so they cannot drift): a tag is
 *   `${PREFIX}${MAJOR}.${MINOR}.${PATCH}${tagSuffix}`
 * with PREFIX = 'v'. MAJOR.MINOR come from package.json; PATCH is the derived global build
 * id; tagSuffix is the per-environment suffix below. The integer-PATCH numbering is fixed;
 * a fundamentally different scheme is a fork of scripts/derive-version.sh, not config.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** One environment the app deploys to. Facets are independent single-purpose switches. */
export interface Environment {
  /** Identity reported at /api/version and to app code (e.g. 'production', 'staging'). */
  name: string;
  /** The git branch that drives this environment. */
  branch: string;
  /** Whether this build is the public face — hide dev-only affordances (the version chip). */
  isPublicFace: boolean;
  /** Whether to emit `X-Robots-Tag: noindex`. */
  noindex: boolean;
  /** Suffix stamped on this environment's derived tags ('' for production, '-dev', …). */
  tagSuffix: string;
}

/** The tag prefix (the fixed part of the tag format; see the module comment). */
export const TAG_PREFIX = 'v';

/**
 * The identity reported when no environment was baked into the build — local `npm run dev`
 * and any context that ran outside a pipeline build. NOT a manifest entry: it is the
 * "no deployment / no provenance" identity, distinct from the `dev` branch and the
 * `staging` environment. The frontend cannot import this module through Vite's `define`,
 * so its inline `local` literal must mirror this object exactly.
 */
export const LOCAL: Omit<Environment, 'branch' | 'tagSuffix'> & { name: 'local' } = {
  name: 'local',
  isPublicFace: false,
  noindex: true,
};

interface ManifestFile {
  environments: Environment[];
}

let cache: Environment[] | undefined;

/** Reads and caches the environments from `environments.json` at the app root. */
export function getEnvironments(): Environment[] {
  if (cache) return cache;
  const file = resolve(process.cwd(), 'environments.json');
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as ManifestFile;
  cache = parsed.environments;
  return cache;
}

/** The environment a branch drives, or undefined if the branch is not an environment. */
export function findByBranch(branch: string): Environment | undefined {
  return getEnvironments().find((e) => e.branch === branch);
}

/** The environment with a given name, or undefined. */
export function findByName(name: string): Environment | undefined {
  return getEnvironments().find((e) => e.name === name);
}
