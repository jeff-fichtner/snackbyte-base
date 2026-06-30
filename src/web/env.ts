/**
 * The current environment, for FRONTEND application code.
 *
 * Build-time constants. In the Vite bundle they come from `define` (see vite.config.ts), set from
 * the environment identity resolved from environments.json by APP_ENV_NAME; the prerender step sets
 * the same globals so server-render and client-hydration agree. The server counterpart is src/env.ts
 * — both read the SAME baked identity, so frontend and server cannot disagree about which
 * environment they are.
 */

// MUST be referenced as the full `globalThis.__X__` token (not via an alias) so Vite's `define`
// textual replacement matches and inlines the build-time literals. An aliased read would not match
// and would silently fall through to the dev fallback below. When nothing is baked (local
// `npm run dev`), the fallback is the `local` identity — this literal MUST mirror LOCAL in
// src/environments.ts.
declare global {
  var __APP_ENV_NAME__: string | undefined;
  var __IS_PUBLIC_FACE__: boolean | undefined;
}

const name = globalThis.__APP_ENV_NAME__ ?? 'local';
const isPublicFace = globalThis.__IS_PUBLIC_FACE__ ?? false;

export interface Env {
  /** The environment name (e.g. 'production', 'staging', or 'local' when unbuilt). */
  name: string;
  /** Whether this is the public face — dev-only affordances are hidden. */
  isPublicFace: boolean;
  /** True when this is the named environment. */
  is(envName: string): boolean;
}

export const env: Env = {
  name,
  isPublicFace,
  is: (envName: string) => envName === name,
};
