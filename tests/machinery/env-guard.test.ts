// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoOpReferences,
  findRawValues,
  isCheckedEnvFile,
} from '../../scripts/lib/env-guard.mjs';

const loadEnvScript = fileURLToPath(new URL('../../scripts/load-env.mjs', import.meta.url));
const checkEnvScript = fileURLToPath(new URL('../../scripts/check-env-files.mjs', import.meta.url));
const dockerignore = fileURLToPath(new URL('../../.dockerignore', import.meta.url));
const gitignore = fileURLToPath(new URL('../../.gitignore', import.meta.url));

describe('assertNoOpReferences (runtime guard)', () => {
  it('passes when every value is resolved', () => {
    expect(() =>
      assertNoOpReferences({ SMTP_PASSWORD: 'real', PORT: '8080', EMPTY: undefined }, 'cmd'),
    ).not.toThrow();
  });

  it('throws naming every unresolved variable and the op run command', () => {
    const run = () =>
      assertNoOpReferences(
        {
          WEBHOOK_SECRET: 'op://app-secrets/example-app.local/WEBHOOK_SECRET',
          PORT: '8080',
          SMTP_PASSWORD: 'op://app-secrets/example-app.local/SMTP_PASSWORD',
        },
        'op run --env-file=.env -- npm run dev',
      );
    expect(run).toThrow(/SMTP_PASSWORD, WEBHOOK_SECRET/);
    expect(run).toThrow(/op run --env-file=\.env -- npm run dev/);
    expect(run).not.toThrow(/PORT/);
  });
});

describe('findRawValues (committed-file check)', () => {
  it('accepts references, empty values and declared config', () => {
    const text = [
      '# config: PORT, HOST',
      '# config: APP_ENV',
      'PORT=8080',
      'HOST=localhost',
      'APP_ENV=staging',
      'BASE_URL=',
      'QUOTED_EMPTY=""',
      'SMTP_PASSWORD=op://app-secrets/example-app.local/SMTP_PASSWORD',
      'export WEBHOOK_SECRET="op://app-secrets/example-app.local/WEBHOOK_SECRET"',
      'INLINE=op://vault/item/field # trailing comment',
      'QUOTED_INLINE="op://vault/item/field" # trailing comment',
      'EMPTY_INLINE= # empty in prod',
      '',
      '   # indented comment',
    ].join('\n');
    expect(findRawValues(text)).toEqual([]);
  });

  it('flags text hidden where dotenv would not read it as a comment or a reference', () => {
    const findings = findRawValues(
      ['HASH_START=#plaintext', 'AFTER_QUOTE="" plaintext', 'UNCLOSED="op://vault/item/field'].join(
        '\n',
      ),
    );
    expect(findings.map((f) => f.key)).toEqual(['HASH_START', 'AFTER_QUOTE', 'UNCLOSED']);
  });

  it('accepts a config declaration that comes after the assignment', () => {
    expect(findRawValues('PORT=8080\n# config: PORT\n')).toEqual([]);
  });

  it('flags an undeclared raw value by line and key, never echoing the value', () => {
    const findings = findRawValues(
      ['# config: PORT', 'PORT=8080', 'API_TOKEN=plaintext'].join('\n'),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 3, key: 'API_TOKEN' });
    expect(JSON.stringify(findings)).not.toContain('plaintext');
  });

  it('flags raw values behind export, quotes and spacing', () => {
    const findings = findRawValues(
      ['export A=raw', "B='raw'", 'C = raw', 'D="op-not-a-reference"'].join('\n'),
    );
    expect(findings.map((f) => f.key)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('flags a line that is not KEY=value (e.g. a pasted key body)', () => {
    const findings = findRawValues('PORT=8080\n-----BEGIN PRIVATE KEY-----\n# config: PORT\n');
    expect(findings).toEqual([{ line: 2, key: null, reason: 'not a KEY=value line' }]);
  });

  it('does not treat a declaration of one key as covering another', () => {
    expect(findRawValues('# config: PORT\nPORTS=1,2\n').map((f) => f.key)).toEqual(['PORTS']);
  });
});

describe('isCheckedEnvFile', () => {
  // Every tracked env file is checked, examples included: a real secret pasted into an example
  // is the classic leak, and an exemption would let it through.
  it.each([
    '.env',
    '.env.production.local',
    '.env.staging',
    '.env.example',
    'config/.env.sample',
    'config/.env',
    'service.env',
  ])('checks %s', (path) => {
    expect(isCheckedEnvFile(path)).toBe(true);
  });

  it.each(['src/env.ts', '.envrc', 'docs/environment.md'])('skips %s', (path) => {
    expect(isCheckedEnvFile(path)).toBe(false);
  });
});

describe('git keeps the committed .env and ignores every other env file', () => {
  // Scratch copies (a rewrite in progress, a personal override) must never be committed by
  // accident; only the reference-style .env is un-ignored.
  it('.gitignore un-ignores .env and nothing else of the .env* family', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-ignore-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      copyFileSync(gitignore, join(dir, '.gitignore'));
      const names = ['.env', '.env.local', '.env.op-next', '.env.example'];
      for (const name of names) writeFileSync(join(dir, name), 'PORT=8080\n');
      // check-ignore prints each path it ignores (and exits 1 when it ignores none of them).
      const ignored = spawnSync('git', ['check-ignore', ...names], { cwd: dir, encoding: 'utf8' })
        .stdout.split('\n')
        .filter(Boolean);
      expect(ignored).toEqual(['.env.local', '.env.op-next', '.env.example']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the image build never sees an env file', () => {
  // The committed .env is local-development config. Inside the image build, scripts/build.mjs
  // imports scripts/load-env.mjs, which would load it; the service runs on Cloud Run's
  // configuration, never on a file.
  it('.dockerignore excludes every .env* and un-ignores none', () => {
    const lines = readFileSync(dockerignore, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
    expect(lines).toContain('.env*');
    expect(lines.filter((line) => line.startsWith('!.env'))).toEqual([]);
  });
});

describe('scripts end to end', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-guard-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // A minimal environment, so nothing the test runner inherited can leak into the child.
  const childEnv = { PATH: process.env.PATH };

  it('load-env stops at startup when .env still holds a reference', () => {
    writeFileSync(join(dir, '.env'), 'PORT=8080\nAPI_TOKEN=op://vault/item/API_TOKEN\n');
    const result = spawnSync('node', [loadEnvScript], {
      cwd: dir,
      env: childEnv,
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unresolved 1Password reference in API_TOKEN');
    expect(result.stderr).toContain('op run --env-file=.env -- node');
  });

  it('load-env passes once the value is resolved in the environment (as op run does)', () => {
    writeFileSync(join(dir, '.env'), 'PORT=8080\nAPI_TOKEN=op://vault/item/API_TOKEN\n');
    const result = spawnSync('node', [loadEnvScript], {
      cwd: dir,
      env: { ...childEnv, API_TOKEN: 'resolved-by-op-run' },
      encoding: 'utf8',
    });
    expect(result.stderr).not.toContain('Unresolved 1Password reference');
    expect(result.status).toBe(0);
  });

  it('check-env fails on a raw value in a tracked env file and names it without the value', () => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(
      join(dir, '.env'),
      '# config: PORT\nPORT=8080\nSMTP_PASSWORD=op://v/i/SMTP_PASSWORD\nAPI_TOKEN=plaintext\n',
    );
    writeFileSync(join(dir, '.env.example'), 'API_TOKEN=pasted-into-the-example\n');
    writeFileSync(join(dir, '.env.untracked'), 'API_TOKEN=not-tracked-so-not-checked\n');
    execFileSync('git', ['add', '.env', '.env.example'], { cwd: dir });

    const failing = spawnSync('node', [checkEnvScript], { cwd: dir, encoding: 'utf8' });
    expect(failing.status).toBe(1);
    expect(failing.stderr).toContain('.env:4 API_TOKEN');
    expect(failing.stderr).toContain('.env.example:1 API_TOKEN');
    expect(failing.stderr).not.toContain('.env.untracked');
    expect(failing.stderr).not.toContain('plaintext');
    expect(failing.stderr).not.toContain('pasted-into-the-example');

    writeFileSync(join(dir, '.env'), '# config: PORT\nPORT=8080\nAPI_TOKEN=op://v/i/API_TOKEN\n');
    writeFileSync(join(dir, '.env.example'), 'API_TOKEN=op://v/i/API_TOKEN\n');
    const passing = spawnSync('node', [checkEnvScript], { cwd: dir, encoding: 'utf8' });
    expect(passing.status).toBe(0);
    expect(passing.stdout).toContain('check:env OK: 2 tracked env file(s)');
  });
});
