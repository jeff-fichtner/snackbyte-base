// The server reads environments.json from its own folder first and the folder above second, both
// at build (the baked identity) and through its runtime reader. As the server part of a larger app it
// bakes the app's one manifest.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const manifest = (name: string, noindex: boolean) =>
  JSON.stringify({
    environments: [{ name, branch: 'b', isPublicFace: !noindex, noindex, tagSuffix: '' }],
  });

describe('the build bakes the manifest it finds: own folder, then the app root', () => {
  let app: string;
  let part: string;

  beforeEach(() => {
    app = realpathSync(mkdtempSync(join(tmpdir(), 'server-lookup-')));
    part = join(app, 'server');
    cpSync(projectRoot, part, {
      recursive: true,
      filter: (src) =>
        !/(^|\/)(node_modules|dist|coverage|tests)(\/|$)/.test(src.slice(projectRoot.length)),
    });
    symlinkSync(join(projectRoot, 'node_modules'), join(part, 'node_modules'));
    rmSync(join(part, 'environments.json'));
  });
  afterEach(() => {
    rmSync(app, { recursive: true, force: true });
  });

  const build = (env: NodeJS.ProcessEnv) =>
    spawnSync('node', ['scripts/build.mjs'], {
      cwd: part,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });

  it('bakes the app root’s manifest when the server has none of its own', () => {
    writeFileSync(join(app, 'environments.json'), manifest('preview', true));
    const result = build({ APP_ENV_NAME: 'preview' });
    expect(result.status, result.stderr).toBe(0);
    const baked = readFileSync(join(part, 'src/env.generated.ts'), 'utf8');
    expect(baked).toContain("name: 'preview'");
    expect(baked).toContain('noindex: true');
  });

  it('prefers its own manifest over the app root’s', () => {
    writeFileSync(join(app, 'environments.json'), manifest('preview', true));
    writeFileSync(join(part, 'environments.json'), manifest('own', false));
    const result = build({ APP_ENV_NAME: 'own' });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(part, 'src/env.generated.ts'), 'utf8')).toContain("name: 'own'");
  });

  it('stops naming both places when neither has a manifest', () => {
    const result = build({});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `environments.json not found: looked in ${join(part, 'environments.json')} and ${join(app, 'environments.json')}`,
    );
  });

  it('the runtime reader finds the app root’s manifest too', () => {
    writeFileSync(join(app, 'environments.json'), manifest('preview', true));
    const result = spawnSync(
      join(part, 'node_modules/.bin/tsx'),
      [
        '-e',
        "import('./src/environments.ts').then((m) => console.log(m.findByName('preview')?.name))",
      ],
      { cwd: part, encoding: 'utf8' },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('preview');
  });
});
