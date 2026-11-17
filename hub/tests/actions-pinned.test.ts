// @vitest-environment node
//
// Every GitHub Action this repo runs, and every one the DEPLOY.md deploy job tells an app to run,
// is pinned to a full commit SHA with the release it tracks in a comment. A tag can be moved by
// whoever controls the action's repository; a SHA cannot. The comment is what lets Dependabot
// (.github/dependabot.yml) move the pin when a new release lands.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const workflowsDir = join(repoRoot, '.github/workflows');

function usesLines(text: string): string[] {
  return [...text.matchAll(/^\s*-?\s*uses:\s*(.+)$/gm)].map((m) => m[1].trim());
}

const sources: [string, string][] = [
  ...readdirSync(workflowsDir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f): [string, string] => [
      `.github/workflows/${f}`,
      readFileSync(join(workflowsDir, f), 'utf8'),
    ]),
  ['DEPLOY.md', readFileSync(join(repoRoot, 'DEPLOY.md'), 'utf8')],
];

describe.each(sources)('%s', (_name, text) => {
  it('pins every action to a full commit SHA, with the release it tracks in a comment', () => {
    const uses = usesLines(text);
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) {
      // A local action (`./path`) is this repository's own code, pinned by the checkout itself.
      if (ref.startsWith('./')) continue;
      expect(ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w.-]+)*@[0-9a-f]{40} # v\d+(\.\d+)*$/);
    }
  });
});

describe('DEPLOY.md and the workflows agree', () => {
  // Dependabot moves the workflow pins but never edits DEPLOY.md, so an action both use would
  // drift apart silently. A bump to one must carry the other.
  it('pins an action to the same commit wherever both use it', () => {
    const pinsIn = (text: string) =>
      new Map(
        usesLines(text)
          .filter((ref) => ref.includes('@'))
          .map((ref) => [ref.split('@')[0], ref] as const),
      );
    const deploy = pinsIn(sources.find(([name]) => name === 'DEPLOY.md')![1]);
    for (const [name, text] of sources.filter(([n]) => n !== 'DEPLOY.md')) {
      for (const [action, ref] of pinsIn(text)) {
        if (deploy.has(action)) expect(deploy.get(action), `${action} in ${name}`).toBe(ref);
      }
    }
  });
});

describe('Dependabot', () => {
  it('moves the github-actions pins, against dev', () => {
    const path = join(repoRoot, '.github/dependabot.yml');
    expect(existsSync(path)).toBe(true);
    const config = readFileSync(path, 'utf8');
    expect(config).toMatch(/package-ecosystem:\s*github-actions/);
    expect(config).toMatch(/target-branch:\s*dev/);
  });
});
