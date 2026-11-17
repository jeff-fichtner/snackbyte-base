/**
 * Version info for the server (the /api/version endpoint).
 *
 * On a build/deploy the version, commit, and date are injected via environment
 * variables (set by the deploy flow). Locally they fall back to a dev placeholder.
 * Reading from env (not package.json) avoids depending on package.json being present
 * next to the compiled server in dist/.
 *
 * `environment` is the BAKED identity (BAKED.name from the build-generated env.generated.ts),
 * not a runtime variable: the environment an image belongs to is decided at build and is
 * immutable, so the server reports the same environment the frontend bundle baked — they
 * cannot disagree. With no build (local `npm run dev`) the committed default bakes 'local'.
 * Only the identity is build-time; the version number/commit/date remain runtime env vars.
 */
import { BAKED } from './env.generated.js';

const isBuild = process.env.CI === 'true' || process.env.NODE_ENV === 'production';

export interface VersionInfo {
  number: string;
  commit: string;
  buildDate: string;
  environment: string;
}

export const version: VersionInfo = {
  number: isBuild ? (process.env.APP_VERSION ?? '0.0.0') : '0.0.0-dev',
  commit: process.env.BUILD_GIT_COMMIT ?? 'dev',
  buildDate: process.env.BUILD_DATE ?? 'dev',
  environment: BAKED.name,
};
