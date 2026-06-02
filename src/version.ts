/**
 * Version info for the server (the /api/version endpoint and startup log).
 *
 * The version number comes from package.json on a build/deploy server (CI), and is a
 * stable "0.0.0-dev" locally. The commit and build date are injected by the deploy
 * flow via environment variables.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readPackageVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const isBuild = process.env.CI === 'true' || process.env.NODE_ENV === 'production';

export interface VersionInfo {
  number: string;
  commit: string;
  buildDate: string;
  environment: string;
}

export const version: VersionInfo = {
  number: isBuild ? readPackageVersion() : '0.0.0-dev',
  commit: process.env.BUILD_GIT_COMMIT ?? 'dev',
  buildDate: process.env.BUILD_DATE ?? 'dev',
  environment: process.env.NODE_ENV ?? 'development',
};
