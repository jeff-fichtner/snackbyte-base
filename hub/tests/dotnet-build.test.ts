// The C# server's build reads the environments manifest from its own folder or the app root, refuses
// an environment the manifest does not list, and bakes the one it is given, so the published server
// reports it. Driven from outside the solution, the way an app's root scripts and its image drive it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { remove, repoRoot, startGroup, stop, waitFor } from './helpers';

const template = join(repoRoot, 'templates/server-dotnet');
const BUILT = /(^|\/)(bin|obj|out)(\/|$)/;

describe('the C# server build', () => {
  let app: string;
  let server: string;
  let running: ChildProcess | undefined;

  beforeEach(() => {
    // An app root holding the one manifest, with the server in server/ and none of its own.
    app = realpathSync(mkdtempSync(join(tmpdir(), 'dotnet-build-')));
    server = join(app, 'server');
    mkdirSync(server);
    cpSync(template, server, {
      recursive: true,
      filter: (src) => !BUILT.test(src.slice(template.length)),
    });
    rmSync(join(server, 'environments.json'));
    cpSync(join(repoRoot, 'environments.json'), join(app, 'environments.json'));
  });
  afterEach(() => {
    stop(running);
    running = undefined;
    remove(app);
  });

  const dotnet = (args: string[], env: NodeJS.ProcessEnv = {}) =>
    spawnSync('dotnet', args, {
      cwd: app,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      maxBuffer: 64 * 1024 * 1024,
    });

  it('refuses an environment the manifest does not list, naming it', () => {
    const build = dotnet(['build', 'server/src/Api'], { APP_ENV_NAME: 'qa' });
    expect(build.status).not.toBe(0);
    expect(build.stdout).toContain("APP_ENV_NAME='qa' is not an environment in");
  });

  it('stops naming both places when neither has the manifest', () => {
    rmSync(join(app, 'environments.json'));
    const build = dotnet(['build', 'server/src/Api']);
    expect(build.status).not.toBe(0);
    expect(build.stdout).toContain('environments.json not found: looked in');
  });

  it('bakes the environment it is built for, read from the app root', async () => {
    const publish = dotnet(['publish', 'server/src/Api', '-c', 'Release', '-o', 'server/out'], {
      APP_ENV_NAME: 'staging',
    });
    expect(publish.status, publish.stdout).toBe(0);
    expect(readFileSync(join(server, 'out/environments.json'), 'utf8')).toBe(
      readFileSync(join(app, 'environments.json'), 'utf8'),
    );
    expect(existsSync(join(server, 'out/Api.dll'))).toBe(true);

    const port = 8290;
    running = startGroup(join(server, 'out'), 'dotnet', ['Api.dll'], {
      ...process.env,
      PORT: String(port),
    });
    await waitFor(`http://localhost:${port}/api/health`, 30_000);
    const res = await fetch(`http://localhost:${port}/api/version`);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(((await res.json()) as { environment: string }).environment).toBe('staging');
  }, 120_000);
});
