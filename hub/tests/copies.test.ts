// Files deliberately duplicated across the templates (each template must stand alone, so none can
// import another's) stay identical. Change one and change them all.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './helpers';

const COPIES: Record<string, string[]> = {
  'environments.json': [
    'environments.json',
    'templates/web-react/environments.json',
    'templates/server-node/environments.json',
  ],
  '.nvmrc': ['.nvmrc', 'templates/web-react/.nvmrc', 'templates/server-node/.nvmrc'],
  'env-guard.mjs': [
    'templates/web-react/scripts/lib/env-guard.mjs',
    'templates/server-node/scripts/lib/env-guard.mjs',
    'hub/files/scripts/lib/env-guard.mjs',
  ],
  'env-guard.d.mts': [
    'templates/web-react/scripts/lib/env-guard.d.mts',
    'templates/server-node/scripts/lib/env-guard.d.mts',
  ],
  'check-env-files.mjs': [
    'templates/web-react/scripts/check-env-files.mjs',
    'templates/server-node/scripts/check-env-files.mjs',
    'hub/files/scripts/check-env-files.mjs',
  ],
  'find-up-one.mjs': [
    'templates/web-react/scripts/lib/find-up-one.mjs',
    'templates/server-node/scripts/lib/find-up-one.mjs',
  ],
  'find-up-one.d.mts': [
    'templates/web-react/scripts/lib/find-up-one.d.mts',
    'templates/server-node/scripts/lib/find-up-one.d.mts',
  ],
  'load-env.mjs': [
    'templates/web-react/scripts/load-env.mjs',
    'templates/server-node/scripts/load-env.mjs',
  ],
  'resolve-env.mjs': [
    'templates/web-react/scripts/resolve-env.mjs',
    'templates/server-node/scripts/resolve-env.mjs',
  ],
  'resolve-env.d.mts': [
    'templates/web-react/scripts/resolve-env.d.mts',
    'templates/server-node/scripts/resolve-env.d.mts',
  ],
  'env-guard.test.ts': [
    'templates/web-react/tests/app/env-guard.test.ts',
    'templates/server-node/tests/app/env-guard.test.ts',
  ],
  'prettier config': [
    'templates/web-react/config/.prettierrc.json',
    'templates/server-node/config/.prettierrc.json',
    'templates/deploy-cloud-run/config/.prettierrc.json',
    'config/.prettierrc.json',
  ],
};

describe.each(Object.entries(COPIES))('%s', (_name, paths) => {
  it('is identical everywhere it is copied', () => {
    const [first, ...rest] = paths.map((p) => readFileSync(join(repoRoot, p), 'utf8'));
    rest.forEach((text, i) => expect(text, paths[i + 1]).toBe(first));
  });
});

describe('the hub root', () => {
  it('holds only the hub: its tooling, its docs, the templates and the spec workflow', () => {
    const allowed = new Set([
      '.claude',
      '.git',
      '.github',
      '.gitignore',
      '.nvmrc',
      '.specify',
      'CLAUDE.md',
      'README.md',
      'SPIN-UP.md',
      'SUBDIR-LAYOUT.md',
      'config',
      'environments.json',
      'eslint.config.js',
      'hub',
      'node_modules',
      'package-lock.json',
      'package.json',
      'specs',
      'templates',
      'tsconfig.json',
      'vitest.config.ts',
    ]);
    const stray = readdirSync(repoRoot).filter((entry) => !allowed.has(entry));
    expect(stray).toEqual([]);
    for (const gone of ['src', 'scripts', 'tests', 'Dockerfile', 'cloudbuild.yaml', '.env']) {
      expect(existsSync(join(repoRoot, gone)), gone).toBe(false);
    }
  });
});
