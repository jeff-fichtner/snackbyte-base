// The hub writes .template.json with the template version the app was made from, found and never
// guessed, and clears the template's own release tags from a clone.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copyRepo, freshCopy, remove, runInit } from './helpers';

const TEMPLATE_URL = 'https://github.com/jeff-fichtner/snackbyte-base.git';
const ident = ['-c', 'user.email=t@t', '-c', 'user.name=t'];
const CHOICES = ['--api=none', '--render=dynamic', '--name=demo'];

/** Makes `dir` a repository whose first commit holds the copy of the repo at `app` (or `dir`). */
function asRepo(dir: string, app = dir): (...a: string[]) => string {
  if (app !== dir) {
    mkdirSync(app, { recursive: true });
    copyRepo(app);
  }
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git(...ident, 'commit', '-qm', 'seed');
  return git;
}

/** Points the template's GitHub URL at `target`, as a stand-in for GitHub. */
function rewriteTo(target: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `url.${target}.insteadOf`,
    GIT_CONFIG_VALUE_0: TEMPLATE_URL,
  };
}

/** "Create from template": the template released with `tags`, and the app's first commit. */
function createdFromTemplate(dir: string, tags: string[]): NodeJS.ProcessEnv {
  const git = asRepo(dir);
  const template = `${dir}-template.git`;
  execFileSync('git', ['clone', '-q', '--bare', dir, template]);
  for (const t of tags) execFileSync('git', ['tag', t], { cwd: template });
  git(...ident, 'commit', '-q', '--amend', '-m', 'Initial commit');
  return rewriteTo(template);
}

function compose(dir: string, env: NodeJS.ProcessEnv) {
  const run = runInit(dir, CHOICES, env);
  expect(run.status, run.stderr).toBe(0);
  return { stamp: JSON.parse(readFileSync(join(dir, '.template.json'), 'utf8')), run };
}

function inCopy(name: string, body: (dir: string) => void): void {
  const dir = freshCopy(`hub-stamp-${name}`);
  try {
    body(dir);
  } finally {
    remove(dir);
    remove(`${dir}-template.git`);
  }
}

describe('the template stamp', () => {
  it("takes a clone's version from the newest release tag on HEAD", () => {
    inCopy('clone', (dir) => {
      const git = asRepo(dir);
      for (const t of ['v1.2.0', 'v1.2.10-dev', 'v1.2.5', 'not-a-release']) git('tag', t);
      const { stamp } = compose(dir, rewriteTo(join(dir, 'unreachable.git')));
      expect(stamp).toEqual({ template: 'snackbyte-base', version: '1.2.10' });
    });
  });

  it("takes a template-created repo's version from the template tag with the same tree", () => {
    inCopy('created', (dir) => {
      const env = createdFromTemplate(dir, ['v1.5.29', 'v1.5.30-dev', 'v1.5.30']);
      const { stamp } = compose(dir, env);
      expect(stamp).toEqual({ template: 'snackbyte-base', version: '1.5.30' });
      // The template's tags were read elsewhere: none of them, and no shallow history, land here.
      expect(execFileSync('git', ['tag', '-l'], { cwd: dir, encoding: 'utf8' })).toBe('');
      expect(existsSync(join(dir, '.git/shallow'))).toBe(false);
    });
  });

  it('records null, and says so, when HEAD no longer matches a release', () => {
    inCopy('changed', (dir) => {
      const env = createdFromTemplate(dir, ['v1.5.30']);
      writeFileSync(join(dir, 'README.md'), 'edited after creation\n');
      execFileSync('git', [...ident, 'commit', '-qam', 'edit README'], { cwd: dir });
      const { stamp, run } = compose(dir, env);
      expect(stamp).toEqual({ template: 'snackbyte-base', version: null });
      expect(run.stderr).toMatch(/matches no snackbyte-base release/);
    });
  });

  it('matches a nested app on its own directory, not the enclosing repo', () => {
    inCopy('nested', (outer) => {
      // The enclosing repo's own release tag sits on HEAD; it says nothing about the app in web/.
      const app = join(outer, 'nested-app');
      const git = asRepo(outer, app);
      git('tag', 'v2.3.0');
      const { stamp, run } = compose(app, rewriteTo(join(outer, 'unreachable.git')));
      expect(stamp).toEqual({ template: 'snackbyte-base', version: null });
      expect(run.stderr).toMatch(/could not fetch snackbyte-base's tags/);
    });
  });

  it('records null, and says so, when the template cannot be reached', () => {
    inCopy('offline', (dir) => {
      asRepo(dir);
      const { stamp, run } = compose(dir, rewriteTo(join(dir, 'unreachable.git')));
      expect(stamp).toEqual({ template: 'snackbyte-base', version: null });
      expect(run.stderr).toMatch(/could not fetch snackbyte-base's tags/);
    });
  });
});

describe("the template's release tags", () => {
  it('are stripped from a clone, so the app starts its own version line', () => {
    inCopy('tags', (dir) => {
      const git = asRepo(dir);
      git('tag', 'v1.2.0');
      git('tag', 'v1.2.5');
      compose(dir, rewriteTo(join(dir, 'unreachable.git')));
      expect(git('tag', '-l').trim()).toBe('');
    });
  });
});
