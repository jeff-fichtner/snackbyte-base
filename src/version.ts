/**
 * Version info for the server (the /api/version endpoint).
 *
 * On a build/deploy the version, commit, and date are injected via environment
 * variables (set by the deploy flow). Locally they fall back to a dev placeholder.
 * Reading from env (not package.json) avoids depending on package.json being present
 * next to the compiled server in dist/.
 */
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
  environment: process.env.NODE_ENV ?? 'development',
};
