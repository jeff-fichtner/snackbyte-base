// The image recipes the hub gives an app (one per server stack) meet the image contract the deploy
// templates rely on: the build arguments the Cloud Run build passes, no facet override, pinned base
// images, a non-root user, and no env file in the build.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './helpers';

const filesDir = join(repoRoot, 'hub/files');
const recipes = readdirSync(filesDir).filter((f) => f.startsWith('Dockerfile.'));
const cloudbuild = readFileSync(
  join(repoRoot, 'templates/deploy-cloud-run/cloudbuild.yaml'),
  'utf8',
);
const passedArgs = [...cloudbuild.matchAll(/--build-arg=([A-Z_]+)=/g)].map((m) => m[1]);

describe.each(recipes)('hub/files/%s', (recipe) => {
  const text = readFileSync(join(filesDir, recipe), 'utf8');

  it('accepts every build argument the Cloud Run build passes', () => {
    expect(passedArgs.sort()).toEqual([
      'APP_ENV_NAME',
      'APP_VERSION',
      'BUILD_DATE',
      'BUILD_GIT_COMMIT',
    ]);
    for (const arg of passedArgs) expect(text, arg).toMatch(new RegExp(`^ARG ${arg}=`, 'm'));
  });

  it('forwards no facet override: the build resolves facets from environments.json', () => {
    expect(text).not.toMatch(/IS_PUBLIC_FACE|NOINDEX/i);
    expect(text).toMatch(/COPY environments\.json/);
  });

  it('pins every base image: an exact version, or for .NET the release the server targets', () => {
    // The .NET images follow DOTNET_RELEASE, the release in the server's global.json (a major and
    // minor, e.g. 11.0); their tags take that release's newest patch. Every other image is exact.
    const froms = [...text.matchAll(/^FROM (\S+)/gm)].map((m) => m[1]);
    expect(froms.length).toBeGreaterThan(1);
    for (const image of froms) {
      if (image.startsWith('mcr.microsoft.com/dotnet/')) {
        expect(image).toMatch(/:\$\{DOTNET_RELEASE\}$/);
        expect(text).toMatch(/^ARG DOTNET_RELEASE=\d+\.\d+$/m);
      } else {
        expect(image).toMatch(/:\d+\.\d+\.\d+/);
      }
    }
  });

  it('runs as a non-root user and listens on PORT', () => {
    const user = [...text.matchAll(/^USER (\S+)/gm)].map((m) => m[1]).pop();
    expect(user).toBeDefined();
    expect(user).not.toMatch(/^(root|0)$/);
    expect(text).toMatch(/^ENV PORT=8080$/m);
  });
});

describe('hub/files/dockerignore', () => {
  // The committed .env is local-development config; a part's build would load it. The service runs
  // on its deploy's configuration, never a file.
  it('excludes every .env* in every part and un-ignores none', () => {
    const lines = readFileSync(join(filesDir, 'dockerignore'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
    expect(lines).toContain('**/.env*');
    expect(lines.filter((line) => line.startsWith('!'))).toEqual([]);
    expect(lines).toContain('**/node_modules/');
  });
});
