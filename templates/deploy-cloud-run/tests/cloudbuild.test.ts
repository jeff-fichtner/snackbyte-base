// @vitest-environment node
//
// Locks the deploy contract in cloudbuild.yaml:
//
//   - the first step refuses to build when a required substitution is empty, naming every one
//     that is missing. A defaulted service, environment or runtime identity would not fail — it
//     would deploy the wrong thing, quietly (the runtime identity case lands a service on the
//     project's default compute service account, which every app in the project shares).
//   - the push step records the digest the registry assigned and fails without one; the deploy
//     step deploys that digest and refuses anything else. A tag can be moved between push and
//     deploy by anything holding write on the repository.
//   - --service-account and --ingress are named on every deploy, so a service never runs as the
//     shared identity or comes up reachable on *.run.app.
//   - there is exactly ONE deploy path: no scripts/deploy.sh.
//
// The step scripts are run as Cloud Build would run them — each `${NAME}` substituted, `$$`
// unescaped to `$`, /workspace pointed at a scratch directory — under bash, with `docker` and
// `gcloud` replaced by stubs on PATH.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const cloudbuild = readFileSync(join(repoRoot, 'cloudbuild.yaml'), 'utf8');
const deployDoc = readFileSync(join(repoRoot, 'DEPLOY.md'), 'utf8');

const REQUIRED = [
  'TAG_NAME',
  'SHORT_SHA',
  '_SERVICE',
  '_REGION',
  '_APP_ENV_NAME',
  '_RUN_SA',
] as const;

const SUBSTITUTIONS: Record<string, string> = {
  PROJECT_ID: 'project',
  TAG_NAME: 'v0.0.0',
  SHORT_SHA: 'abc1234',
  _REGION: 'region',
  _REPO: 'repo',
  _SERVICE: 'service',
  _APP_ENV_NAME: 'staging',
  _RUN_SA: 'service-stg-runtime@project.iam.gserviceaccount.com',
};
const DIGEST = `region-docker.pkg.dev/project/repo/service@sha256:${'a'.repeat(64)}`;
const TAGGED = 'region-docker.pkg.dev/project/repo/service:v0.0.0-abc1234';
// The same image, as known to some other repository.
const FOREIGN = `region-docker.pkg.dev/project/repo/other@sha256:${'b'.repeat(64)}`;
// Right repository, but not a sha256 digest.
const MALFORMED = 'region-docker.pkg.dev/project/repo/service@sha256:not-a-digest';

// `docker push` succeeds only when told to; `docker inspect` prints what it is given (one repo
// digest per line), and fails when given nothing — as the real one does on an image that was
// never pushed.
const DOCKER = `#!/bin/bash
case "$1" in
  push) [ "$STUB_PUSH" = ok ] ;;
  inspect) [ -n "$STUB_INSPECT" ] && printf '%s\\n' "$STUB_INSPECT" ;;
esac
`;
// `gcloud` records its arguments, one per line, so a test can tell whether it ran and with what.
const GCLOUD = `#!/bin/bash
printf '%s\\n' "$@" > "$STUB_GCLOUD_ARGS"
`;

// A step is `- id: <id>`; its script is the `- |` block under `args:`, dedented. The block must sit
// inside that step — before the next `- id:` — or the test would run a neighbour's script. A blank
// line inside the block belongs to it (YAML keeps it), so only a non-blank, less-indented line
// ends it.
function stepBody(id: string): string {
  const lines = cloudbuild.split('\n');
  const step = lines.findIndex((line) => new RegExp(`^\\s*- id: ${id}\\s*$`).test(line));
  expect(step, `no step with id ${id}`).toBeGreaterThan(-1);
  const next = lines.findIndex((line, i) => i > step && /^\s*- id: /.test(line));
  const end = next === -1 ? lines.length : next;
  const block = lines.findIndex((line, i) => i > step && i < end && /^\s*- \|\s*$/.test(line));
  expect(block, `step ${id} has no \`- |\` script block`).toBeGreaterThan(step);
  const indent = /^\s*/.exec(lines[block + 1])?.[0] ?? '';
  expect(indent.length).toBeGreaterThan(0);
  const body: string[] = [];
  for (let i = block + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      body.push('');
      continue;
    }
    if (!lines[i].startsWith(indent)) break;
    body.push(lines[i].slice(indent.length));
  }
  return body.join('\n').trimEnd();
}

function substitute(script: string, values: Record<string, string>, workspace: string): string {
  return script
    .replace(/(?<!\$)\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name: string) => values[name] ?? '')
    .replaceAll('$$', '$')
    .replaceAll('/workspace/', `${workspace}/`);
}

let dir: string;
let digestFile: string;
let gcloudArgs: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cloudbuild-'));
  digestFile = join(dir, 'image_digest.txt');
  gcloudArgs = join(dir, 'gcloud-args.txt');
  mkdirSync(join(dir, 'bin'));
  for (const [name, source] of [
    ['docker', DOCKER],
    ['gcloud', GCLOUD],
  ]) {
    writeFileSync(join(dir, 'bin', name), source);
    chmodSync(join(dir, 'bin', name), 0o755);
  }
  writeFileSync(join(dir, 'build_date.txt'), '2026-01-01T00:00:00Z\n');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(id: string, values: Record<string, string> = SUBSTITUTIONS, env = {}) {
  const result = spawnSync('bash', ['-c', substitute(stepBody(id), values, dir)], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
      STUB_GCLOUD_ARGS: gcloudArgs,
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('cloudbuild.yaml require step', () => {
  it('is the first step, so nothing is built or pushed before it', () => {
    const first = cloudbuild.split('\n').find((line) => /^\s*- id: /.test(line));
    expect(first?.trim()).toBe('- id: require');
  });

  it('declares each required user substitution with an empty default', () => {
    for (const name of REQUIRED.filter((n) => n.startsWith('_'))) {
      expect(cloudbuild).toMatch(new RegExp(`^\\s*${name}:\\s*''\\s*$`, 'm'));
    }
  });

  it('passes when every required substitution is set', () => {
    const r = run('require');
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });

  for (const name of REQUIRED) {
    it(`fails naming ${name} when it is empty`, () => {
      const r = run('require', { ...SUBSTITUTIONS, [name]: '' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`required substitution(s) not set: ${name} `);
    });
  }

  it('names every missing value at once', () => {
    const r = run('require', {});
    expect(r.status).toBe(1);
    for (const name of REQUIRED) expect(r.stderr).toContain(` ${name}`);
  });
});

describe('cloudbuild.yaml push step', () => {
  it('records the digest the registry assigned', () => {
    const r = run('push', SUBSTITUTIONS, { STUB_PUSH: 'ok', STUB_INSPECT: DIGEST });
    expect(r.status).toBe(0);
    expect(readFileSync(digestFile, 'utf8').trim()).toBe(DIGEST);
  });

  it('fails when the push fails', () => {
    const r = run('push', SUBSTITUTIONS, { STUB_PUSH: 'refused', STUB_INSPECT: DIGEST });
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('deploying');
  });

  it('fails when the pushed image has no digest to read', () => {
    const r = run('push', SUBSTITUTIONS, { STUB_PUSH: 'ok', STUB_INSPECT: '' });
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('deploying');
  });

  it('fails when what it read is not a digest', () => {
    const r = run('push', SUBSTITUTIONS, { STUB_PUSH: 'ok', STUB_INSPECT: TAGGED });
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('deploying');
  });

  it("picks this service's digest when another repository's is listed first", () => {
    const r = run('push', SUBSTITUTIONS, {
      STUB_PUSH: 'ok',
      STUB_INSPECT: `${FOREIGN}\n${DIGEST}`,
    });
    expect(r.status).toBe(0);
    expect(readFileSync(digestFile, 'utf8').trim()).toBe(DIGEST);
  });

  it('fails when the only digest belongs to another repository', () => {
    const r = run('push', SUBSTITUTIONS, { STUB_PUSH: 'ok', STUB_INSPECT: FOREIGN });
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('deploying');
  });

  it('fails when the digest is malformed', () => {
    const r = run('push', SUBSTITUTIONS, { STUB_PUSH: 'ok', STUB_INSPECT: MALFORMED });
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('deploying');
  });

  it("does not match a repository whose name differs only where this one's has a dot", () => {
    const lookalike = DIGEST.replace('region-docker.pkg.dev', 'region-dockerXpkg.dev');
    const r = run('push', SUBSTITUTIONS, { STUB_PUSH: 'ok', STUB_INSPECT: lookalike });
    expect(r.status).not.toBe(0);
  });
});

describe('cloudbuild.yaml deploy step', () => {
  function deployArgs(): string[] {
    return readFileSync(gcloudArgs, 'utf8').split('\n');
  }

  it('deploys the recorded digest', () => {
    writeFileSync(digestFile, `${DIGEST}\n`);
    const r = run('deploy');
    expect(r.status).toBe(0);
    expect(deployArgs()).toContain(`--image=${DIGEST}`);
  });

  it('names the runtime identity and region, and locks ingress to the load balancer', () => {
    writeFileSync(digestFile, `${DIGEST}\n`);
    expect(run('deploy').status).toBe(0);
    expect(deployArgs()).toContain(`--service-account=${SUBSTITUTIONS._RUN_SA}`);
    expect(deployArgs()).toContain(`--region=${SUBSTITUTIONS._REGION}`);
    expect(deployArgs()).toContain('--ingress=internal-and-cloud-load-balancing');
  });

  for (const [what, content] of [
    ['no digest file exists', null],
    ['the digest file is empty', ''],
    ['the file names a tag', `${TAGGED}\n`],
    ['the digest is from another repository', `${FOREIGN}\n`],
    ['the digest is malformed', `${MALFORMED}\n`],
    ['the file holds two digests', `${DIGEST}\n${DIGEST}\n`],
  ] as const) {
    it(`refuses, without calling gcloud, when ${what}`, () => {
      if (content !== null) writeFileSync(digestFile, content);
      const r = run('deploy');
      expect(r.status).not.toBe(0);
      expect(existsSync(gcloudArgs)).toBe(false);
    });
  }

  it('does not let gcloud try to enable APIs the deployer may not manage', () => {
    expect(cloudbuild).toContain("env: ['CLOUDSDK_CORE_SHOULD_PROMPT_TO_ENABLE_API=false']");
  });
});

describe('the environment comes from the manifest', () => {
  // A build-arg that sets a facet directly (the version chip's public-face flag) could disagree
  // with environments.json — and a defaulted one silently would. The deploy names only the
  // environment; the build resolves its facets.
  it('forwards no facet override into the image', () => {
    const dockerfile = readFileSync(join(repoRoot, 'Dockerfile'), 'utf8');
    expect(cloudbuild).not.toMatch(/IS_PUBLIC_FACE/);
    expect(dockerfile).not.toMatch(/IS_PUBLIC_FACE/);
  });
});

describe('DEPLOY.md', () => {
  it('passes every required substitution in each build it documents', () => {
    // The manual deploy command and the deploy job: a documented submit that the require step
    // rejects is a copy-paste trap.
    const submits = [...deployDoc.matchAll(/--substitutions="([^"]+)"/g)].map((m) => m[1]);
    expect(submits.length).toBeGreaterThanOrEqual(2);
    for (const submit of submits) {
      for (const name of REQUIRED) expect(submit, submit).toContain(`${name}=`);
    }
  });
});

describe('one deploy path', () => {
  it('ships no manual deploy script', () => {
    expect(existsSync(join(repoRoot, 'scripts/deploy.sh'))).toBe(false);
  });
});
