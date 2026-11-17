/**
 * The current environment, for SERVER application code.
 *
 * Reads the BAKED identity (decided at build from environments.json and inlined into the compiled
 * server via env.generated.ts) — so the server reports the environment its image was built for,
 * matching what the frontend bundle baked (src/web/env.ts). With no build (local `npm run dev`)
 * the committed default bakes the `local` identity. Branch on this to vary behavior by
 * environment (e.g. `if (env.is('staging'))`) without a feature-flag system.
 */
import { BAKED } from './env.generated.js';

export interface Env {
  /** The environment name (e.g. 'production', 'staging', or 'local' when unbuilt). */
  name: string;
  /** Whether this is the public face — dev-only affordances are hidden. */
  isPublicFace: boolean;
  /** True when this is the named environment. */
  is(name: string): boolean;
}

export const env: Env = {
  name: BAKED.name,
  isPublicFace: BAKED.isPublicFace,
  is: (name: string) => name === BAKED.name,
};
