/**
 * Version info for the frontend (the version chip).
 *
 * Values are build-time constants. In the Vite bundle they come from `define` (see
 * vite.config.ts). If this app prerenders, the build-time render reads the same values
 * from matching globals (set from the same env), so the prerendered HTML and the client
 * hydration agree (no hydration mismatch).
 */

export interface VersionInfo {
  number: string;
  commit: string;
  buildDate: string;
  /** Show the chip everywhere except production. */
  display: boolean;
}

interface VersionGlobals {
  __APP_VERSION__?: string;
  __GIT_COMMIT__?: string;
  __BUILD_DATE__?: string;
  __IS_PRODUCTION__?: boolean;
}
const g = globalThis as typeof globalThis & VersionGlobals;

export const version: VersionInfo = {
  number: g.__APP_VERSION__ ?? '0.0.0-dev',
  commit: g.__GIT_COMMIT__ ?? 'dev',
  buildDate: g.__BUILD_DATE__ ?? 'dev',
  display: !(g.__IS_PRODUCTION__ ?? false),
};
