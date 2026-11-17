// The hub resolver refuses a missing or unknown choice before it changes anything, naming what is
// wrong and the values it accepts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshCopy, remove, runInit } from './helpers';

let dir: string;
beforeAll(() => {
  dir = freshCopy('hub-refuse');
});
afterAll(() => remove(dir));

function refused(args: string[]) {
  const run = runInit(dir, args);
  expect(run.status).not.toBe(0);
  // Nothing moved: the templates, the hub and the hub's own package are all still there.
  expect(existsSync(join(dir, 'templates/web-react/template.json'))).toBe(true);
  expect(existsSync(join(dir, 'hub/init.mjs'))).toBe(true);
  expect(existsSync(join(dir, 'web'))).toBe(false);
  expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name).toBe('snackbyte-base');
  expect(run.stderr).toContain('Usage: npm run init --');
  return run.stderr;
}

describe('the hub resolver refuses', () => {
  it('a run with no choices, naming every missing one and its values', () => {
    const stderr = refused([]);
    expect(stderr).toContain('--api is required: node, none');
    expect(stderr).toContain('--render is required: prerender, dynamic');
    expect(stderr).toContain('--name is required');
  });

  it('an unknown API choice', () => {
    expect(refused(['--api=rust', '--render=dynamic', '--name=demo'])).toContain(
      '--api must be one of node, none',
    );
  });

  it('an unknown render choice', () => {
    expect(refused(['--api=node', '--render=ssr', '--name=demo'])).toContain(
      '--render must be one of prerender, dynamic',
    );
  });

  it('a missing name', () => {
    expect(refused(['--api=node', '--render=dynamic'])).toContain('--name is required');
  });

  it('a flag it does not take (such as the old --mode)', () => {
    expect(refused(['--mode=static', '--api=node', '--render=dynamic', '--name=demo'])).toContain(
      '--mode is not a choice the hub takes',
    );
  });
});
