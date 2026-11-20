/**
 * The deploy proof (live; run by a person, never by CI): a throwaway React + C# app composed from
 * this checkout, deployed through the Cloud Run deploy template to a non-production service,
 * checked, and deleted again. Four steps, each its own command, so creating and deleting are each
 * run deliberately:
 *
 *   node hub/deploy-proof.mjs compose --dir=<new folder>
 *   node hub/deploy-proof.mjs create  --dir=<folder> --project=<id> --region=<region>
 *                                     --service=<service> --run-sa=<id> --deployer=<id> --env=<name>
 *   node hub/deploy-proof.mjs check   --dir=<folder> [--url=<base> to check a local run, no token]
 *   node hub/deploy-proof.mjs delete  --dir=<folder>
 *
 * compose: copies this checkout into the new folder, composes `--api=dotnet --render=prerender`
 * there, and commits it (the deploy names its build by commit).
 *
 * create: creates the runtime service account (`--run-sa`, an id) with the one project role Cloud
 * Run needs, lets the deploy identity (`--deployer`, an id) act as it, submits the app's own
 * cloudbuild.yaml as the deploy identity, and then opens the service to authenticated callers on
 * its run.app address (`--ingress=all`, no public invoker), since the deploy locks it to a load
 * balancer the proof does not touch. Everything it creates is recorded in <folder>/.proof.json as
 * it goes, so a failed create can still be deleted.
 *
 * check: /api/health, /api/version (the environment and the version the deploy set) and the page
 * (prerendered, with the noindex header exactly when the environment says so), called with the
 * signed-in account's identity token.
 *
 * delete: removes exactly what .proof.json records (the service, its images, the build's source
 * upload, the project role, the service account) and then the folder. Cloud Build's history and the
 * logs stay, as they do for every build.
 *
 * Every value is a flag with no default: each one names a real project, account or service, and a
 * guessed one would act on the wrong thing.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOT_IN_A_CLONE =
  /(^|\/)(node_modules|dist|coverage|out|bin|obj|\.git)(\/|$)|(^|\/)\.env\.[^/]*$|(^|\/)server\/public(\/|$)/;
const TAG = 'v0.1.0-dev';
const STATE = '.proof.json';

function fail(message) {
  console.error(`deploy-proof: ${message}`);
  process.exit(1);
}

/** Parses `--name=value` flags; every name in `required` must be present and non-empty. */
export function parseFlags(argv, required, optional = []) {
  const flags = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!match) throw new Error(`not a --name=value flag: ${arg}`);
    const [, name, value] = match;
    if (!required.includes(name) && !optional.includes(name)) {
      throw new Error(`unknown flag --${name}`);
    }
    flags[name] = value;
  }
  const missing = required.filter((name) => !flags[name]);
  if (missing.length) throw new Error(`missing ${missing.map((n) => `--${n}`).join(', ')}`);
  return flags;
}

function run(command, args, { cwd, quiet = false } = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed (exit ${result.status}):\n${result.stderr ?? ''}`);
  }
  return result.stdout.trim();
}

/** Retries a call that can fail for a few seconds after an account is created. */
async function settle(what, call) {
  for (let attempt = 1; ; attempt++) {
    try {
      return call();
    } catch (error) {
      if (attempt === 6) throw error;
      console.log(`  (${what} not visible yet; retrying in 10s)`);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

const readState = (dir) => JSON.parse(readFileSync(join(dir, STATE), 'utf8'));
const saveState = (dir, state) => writeFileSync(join(dir, STATE), JSON.stringify(state, null, 2));

function compose({ dir }) {
  if (existsSync(dir)) fail(`${dir} already exists; compose makes a new folder`);
  cpSync(root, dir, {
    recursive: true,
    filter: (src) => !NOT_IN_A_CLONE.test(src.slice(root.length)),
  });
  run('node', ['hub/init.mjs', '--api=dotnet', '--render=prerender', '--name=hub-proof'], {
    cwd: dir,
  });
  run('git', ['init', '-q', '-b', 'dev'], { cwd: dir });
  run('git', ['add', '-A'], { cwd: dir });
  run('git', ['commit', '-q', '-m', 'hub deploy proof'], { cwd: dir });
  console.log(`\ncomposed a React + C# app in ${dir}`);
}

async function create(flags) {
  const { dir, project, region, service, env, deployer } = flags;
  if (!existsSync(join(dir, 'cloudbuild.yaml'))) fail(`${dir} holds no composed app (run compose)`);
  if (existsSync(join(dir, STATE))) fail(`${dir}/${STATE} exists: delete what it records first`);
  const runSa = `${flags['run-sa']}@${project}.iam.gserviceaccount.com`;
  const deployerSa = `${deployer}@${project}.iam.gserviceaccount.com`;
  // The proof deploys only to a service that does not exist yet, so it can never replace one.
  const existing = spawnSync(
    'gcloud',
    [
      'run',
      'services',
      'describe',
      service,
      `--project=${project}`,
      `--region=${region}`,
      '--format=value(metadata.name)',
    ],
    { encoding: 'utf8' },
  );
  if (existing.status === 0)
    fail(`a Cloud Run service named ${service} already exists in ${region}`);
  if (!/Cannot find service|NOT_FOUND/.test(existing.stderr)) {
    fail(`could not confirm ${service} is free:\n${existing.stderr}`);
  }
  const state = { project, region, service, created: [] };
  const record = (entry) => {
    state.created.push(entry);
    saveState(dir, state);
  };

  run('gcloud', [
    'iam',
    'service-accounts',
    'create',
    flags['run-sa'],
    `--project=${project}`,
    '--display-name=hub deploy proof (throwaway)',
  ]);
  record({ kind: 'service-account', email: runSa });

  await settle('the new account', () =>
    run(
      'gcloud',
      [
        'projects',
        'add-iam-policy-binding',
        project,
        `--member=serviceAccount:${runSa}`,
        '--role=roles/logging.logWriter',
        '--condition=None',
        '--format=none',
      ],
      { quiet: true },
    ),
  );
  record({
    kind: 'project-role',
    member: `serviceAccount:${runSa}`,
    role: 'roles/logging.logWriter',
  });

  await settle('the new account', () =>
    run(
      'gcloud',
      [
        'iam',
        'service-accounts',
        'add-iam-policy-binding',
        runSa,
        `--project=${project}`,
        `--member=serviceAccount:${deployerSa}`,
        '--role=roles/iam.serviceAccountUser',
        '--format=none',
      ],
      { quiet: true },
    ),
  );

  const sha = run('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir });
  const substitutions = [
    `TAG_NAME=${TAG}`,
    `SHORT_SHA=${sha}`,
    `_SERVICE=${service}`,
    `_REGION=${region}`,
    `_APP_ENV_NAME=${env}`,
    `_RUN_SA=${runSa}`,
  ].join(',');
  const buildId = run(
    'gcloud',
    [
      'builds',
      'submit',
      '--async',
      '--config=cloudbuild.yaml',
      `--substitutions=${substitutions}`,
      `--service-account=projects/${project}/serviceAccounts/${deployerSa}`,
      '--default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET',
      `--project=${project}`,
      `--region=${region}`,
      '--format=value(id)',
      '.',
    ],
    { cwd: dir },
  );
  const source = run('gcloud', [
    'builds',
    'describe',
    buildId,
    `--project=${project}`,
    `--region=${region}`,
    '--format=value(source.storageSource.bucket,source.storageSource.object)',
  ]).split(/\s+/);
  record({ kind: 'source-upload', url: `gs://${source[0]}/${source[1]}` });
  record({ kind: 'image-package', repository: 'cloud-run-source-deploy', name: service });
  record({ kind: 'cloud-run-service', name: service });

  spawnSync(
    'gcloud',
    ['builds', 'log', '--stream', buildId, `--project=${project}`, `--region=${region}`],
    { stdio: 'inherit' },
  );
  const status = run('gcloud', [
    'builds',
    'describe',
    buildId,
    `--project=${project}`,
    `--region=${region}`,
    '--format=value(status)',
  ]);
  if (status !== 'SUCCESS')
    fail(`build ${buildId} ended ${status}; run delete to remove what it made`);

  run('gcloud', [
    'run',
    'services',
    'update',
    service,
    `--project=${project}`,
    `--region=${region}`,
    '--ingress=all',
    '--format=none',
  ]);
  state.url = run('gcloud', [
    'run',
    'services',
    'describe',
    service,
    `--project=${project}`,
    `--region=${region}`,
    '--format=value(status.url)',
  ]);
  state.env = env;
  state.tag = TAG;
  saveState(dir, state);
  console.log(
    `\ndeployed ${service} at ${state.url} (private: only signed-in callers with invoke)`,
  );
}

/** Checks a running app; returns the failed expectations (empty when it passes). */
export async function checkApp({ url, env, tag, noindex, headers = {} }) {
  const failures = [];
  const expect = (ok, what) => {
    if (!ok) failures.push(what);
  };
  const get = (path) => fetch(new URL(path, url), { headers });

  const health = await get('/api/health');
  const healthBody = health.ok ? await health.json() : null;
  expect(
    healthBody?.status === 'ok',
    `/api/health answers ok (got ${health.status} ${JSON.stringify(healthBody)})`,
  );

  const version = await get('/api/version');
  const v = version.ok ? await version.json() : null;
  expect(
    v?.environment === env && (v?.number === tag || `v${v?.number}` === tag),
    `/api/version reports ${tag} and ${env} (got ${version.status} ${JSON.stringify(v)})`,
  );

  const page = await get('/');
  const html = await page.text();
  expect(
    page.ok && html.includes('<div id="root"><main'),
    `the page is served, prerendered (got ${page.status})`,
  );
  expect(
    (page.headers.get('x-robots-tag') === 'noindex') === noindex,
    `noindex ${noindex ? 'on' : 'off'} for ${env} (got ${page.headers.get('x-robots-tag')})`,
  );
  return failures;
}

async function check(flags) {
  const { dir } = flags;
  const manifest = JSON.parse(readFileSync(join(dir, 'environments.json'), 'utf8'));
  let target;
  if (flags.url) {
    target = { url: flags.url, env: flags.env, tag: flags.tag, headers: {} };
    if (!target.env || !target.tag) fail('--url needs --env and --tag');
  } else {
    const state = readState(dir);
    if (!state.url) fail('no deployed service recorded: run create first');
    const token = run('gcloud', ['auth', 'print-identity-token'], { quiet: true });
    target = {
      url: state.url,
      env: state.env,
      tag: state.tag,
      headers: { Authorization: `Bearer ${token}` },
    };
  }
  const entry = manifest.environments.find((e) => e.name === target.env);
  if (!entry) fail(`${target.env} is not an environment in ${dir}/environments.json`);
  const failures = await checkApp({ ...target, noindex: entry.noindex });
  console.log(`checked ${target.url}`);
  for (const failure of failures) console.log(`  ✖ ${failure}`);
  if (failures.length) process.exit(1);
  console.log('  ✔ /api/health, /api/version and the page');
}

function remove({ dir }) {
  if (!existsSync(join(dir, STATE))) fail(`${dir}/${STATE} not found: nothing recorded to delete`);
  const { project, region, created } = readState(dir);
  const problems = [];
  const attempt = (args) => {
    try {
      run('gcloud', args, { quiet: true });
    } catch (error) {
      // Something a failed create never made is already gone, which is what delete wants.
      if (
        /NOT_FOUND|not found|Cannot find|does not exist|matched no objects/i.test(error.message)
      ) {
        console.log('  (already gone)');
      } else {
        console.error(error.message);
        problems.push(error.message);
      }
    }
  };
  // Newest first: the service before its images, the role before its account.
  for (const entry of [...created].reverse()) {
    if (entry.kind === 'cloud-run-service')
      attempt([
        'run',
        'services',
        'delete',
        entry.name,
        `--project=${project}`,
        `--region=${region}`,
        '--quiet',
      ]);
    if (entry.kind === 'image-package')
      attempt([
        'artifacts',
        'packages',
        'delete',
        entry.name,
        `--repository=${entry.repository}`,
        `--location=${region}`,
        `--project=${project}`,
        '--quiet',
      ]);
    if (entry.kind === 'source-upload') attempt(['storage', 'rm', entry.url]);
    if (entry.kind === 'project-role')
      attempt([
        'projects',
        'remove-iam-policy-binding',
        project,
        `--member=${entry.member}`,
        `--role=${entry.role}`,
        '--condition=None',
        '--format=none',
      ]);
    if (entry.kind === 'service-account')
      attempt([
        'iam',
        'service-accounts',
        'delete',
        entry.email,
        `--project=${project}`,
        '--quiet',
      ]);
  }
  if (problems.length) {
    console.error(
      `\n${problems.length} deletion(s) failed; ${dir} is kept so delete can run again.`,
    );
    process.exit(1);
  }
  rmSync(dir, { recursive: true, force: true });
  console.log(`\ndeleted everything the proof created, and ${dir}`);
}

const STEPS = {
  compose: { required: ['dir'], run: compose },
  create: {
    required: ['dir', 'project', 'region', 'service', 'run-sa', 'deployer', 'env'],
    run: create,
  },
  check: { required: ['dir'], optional: ['url', 'env', 'tag'], run: check },
  delete: { required: ['dir'], run: remove },
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [stepName, ...rest] = process.argv.slice(2);
  const step = STEPS[stepName];
  if (!step) fail(`the step is one of: ${Object.keys(STEPS).join(', ')}`);
  let flags;
  try {
    flags = parseFlags(rest, step.required, step.optional);
  } catch (error) {
    fail(`${stepName}: ${error.message}`);
  }
  if (!isAbsolute(flags.dir)) fail('--dir must be an absolute path');
  try {
    await step.run(flags);
  } catch (error) {
    fail(error.message);
  }
}
