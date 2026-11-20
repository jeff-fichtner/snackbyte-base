/**
 * The image check (opt-in, needs Docker; not part of check:all):
 *
 *   npm run e2e:image                 # every server choice in the registry
 *   npm run e2e:image -- node dotnet  # only these
 *
 * For each server choice: compose an app (prerendered, so the version chip is visible in the HTML)
 * in a scratch copy of this repo, build its image twice with the build arguments the Cloud Run build
 * passes (APP_ENV_NAME=staging, then production), run each with PORT set, and check what a deploy
 * relies on: the page; the chip on staging only; /api/version reporting the version and environment,
 * and an unknown /api path answering 404 (or, with no API, /api/ falling through to the page);
 * X-Robots-Tag: noindex on staging only; a non-root user. Containers, images and scratch copies are
 * removed afterwards, pass or fail.
 *
 * It builds for this machine's platform: the recipes are the same on every platform, and Cloud Build
 * builds the deployed image on linux/amd64 itself.
 */
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readRegistry } from './lib/manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registry = readRegistry(resolve(root, 'hub'));
const choices = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(registry.roles.server.options);

const NOT_IN_A_CLONE =
  /(^|\/)(node_modules|dist|coverage|out|bin|obj|\.git)(\/|$)|(^|\/)\.env\.[^/]*$|(^|\/)server\/public(\/|$)/;
const VERSION = '9.8.7';
const COMMIT = 'abc1234';
const DATE = '2026-11-17T00:00:00Z';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
  }
  return result.stdout.trim();
}

async function waitFor(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`${url} did not answer within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Checks one built image; returns the failed expectations (empty when it passes). */
async function checkImage(image, { hasApi, envName, port }) {
  const failures = [];
  const expect = (ok, what) => {
    if (!ok) failures.push(what);
  };
  // The runtime environment the Cloud Run deploy sets (cloudbuild.yaml's --set-env-vars); Cloud Run
  // itself sets PORT.
  const runtimeEnv = [
    'NODE_ENV=production',
    `APP_VERSION=${VERSION}`,
    `BUILD_GIT_COMMIT=${COMMIT}`,
    `BUILD_DATE=${DATE}`,
    `PORT=${port}`,
  ].flatMap((pair) => ['-e', pair]);
  const container = run('docker', [
    'run',
    '-d',
    '--rm',
    ...runtimeEnv,
    '-p',
    `${port}:${port}`,
    image,
  ]);
  try {
    await waitFor(`http://localhost:${port}/`);
    const page = await fetch(`http://localhost:${port}/`);
    const html = await page.text();
    const staging = envName === 'staging';
    expect(html.includes('<div id="root"><main'), 'the page is prerendered');
    expect(html.includes(`v${VERSION}`) === staging, `the chip shows on staging only (${envName})`);
    expect(
      (page.headers.get('x-robots-tag') === 'noindex') === staging,
      `noindex on staging only (${envName})`,
    );
    const health = await fetch(`http://localhost:${port}/api/health`);
    expect(
      (health.headers.get('content-type') ?? '').includes(
        hasApi ? 'application/json' : 'text/html',
      ),
      hasApi ? '/api/health answers JSON' : '/api/health falls through to the page',
    );
    if (hasApi) {
      const unknown = await fetch(`http://localhost:${port}/api/not-a-route`);
      expect(
        unknown.status === 404 &&
          (unknown.headers.get('content-type') ?? '').includes('application/json'),
        `an unknown /api path answers 404 JSON (got ${unknown.status})`,
      );
      const version = await (await fetch(`http://localhost:${port}/api/version`)).json();
      expect(
        version.number === VERSION &&
          version.commit === COMMIT &&
          version.buildDate === DATE &&
          version.environment === envName,
        `/api/version reports ${VERSION} and ${envName} (got ${JSON.stringify(version)})`,
      );
    }
    const uid = run('docker', ['exec', container, 'id', '-u']);
    expect(uid !== '0', `runs as a non-root user (uid ${uid})`);
  } finally {
    spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  }
  return failures;
}

const results = [];
let port = 18_080;
for (const choice of choices) {
  const option = registry.roles.server.options[choice];
  if (!option) {
    console.error(
      `--api=${choice} is not a server choice (have: ${Object.keys(registry.roles.server.options)})`,
    );
    process.exit(1);
  }
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `hub-image-${choice}-`)));
  const images = [];
  try {
    cpSync(root, dir, {
      recursive: true,
      filter: (src) => !NOT_IN_A_CLONE.test(src.slice(root.length)),
    });
    run('node', ['hub/init.mjs', `--api=${choice}`, '--render=prerender', '--name=demo'], {
      cwd: dir,
    });
    for (const envName of ['staging', 'production']) {
      const image = `hub-image-e2e:${choice}-${envName}`;
      images.push(image);
      const started = Date.now();
      run(
        'docker',
        [
          'build',
          `--build-arg=APP_ENV_NAME=${envName}`,
          `--build-arg=APP_VERSION=${VERSION}`,
          `--build-arg=BUILD_GIT_COMMIT=${COMMIT}`,
          `--build-arg=BUILD_DATE=${DATE}`,
          '-t',
          image,
          '.',
        ],
        { cwd: dir },
      );
      const seconds = Math.round((Date.now() - started) / 1000);
      const failures = await checkImage(image, { hasApi: option.hasApi, envName, port: port++ });
      results.push({ choice, envName, seconds, failures });
      console.log(
        `${failures.length ? '✖' : '✔'} --api=${choice} ${envName} (built in ${seconds}s)`,
      );
      for (const failure of failures) console.log(`    ✖ ${failure}`);
    }
  } finally {
    for (const image of images) spawnSync('docker', ['rmi', '-f', image], { stdio: 'ignore' });
    rmSync(dir, { recursive: true, force: true });
  }
}

const failed = results.filter((r) => r.failures.length > 0);
console.log(`\n${results.length - failed.length}/${results.length} images pass.`);
process.exit(failed.length > 0 ? 1 : 0);
