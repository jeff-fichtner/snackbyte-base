// Each template stands on its own: a sound manifest, and no reference to a sibling template, to the
// hub, or to the spec workflow, so it can move into a repository of its own unchanged.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { manifestProblems, readRegistry } from '../lib/manifest.mjs';
import { repoRoot } from './helpers';

const templatesDir = join(repoRoot, 'templates');
const ids = readdirSync(templatesDir).filter((id) =>
  statSync(join(templatesDir, id)).isDirectory(),
);
const SKIP = /(^|\/)(node_modules|dist|coverage|bin|obj|out|public)(\/|$)|package-lock\.json$/;

/** Every file in a template a person wrote (not installs, builds or lockfiles). */
function sourceFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const rel = relative(base, path);
    if (SKIP.test(rel)) return [];
    return statSync(path).isDirectory() ? sourceFiles(path, base) : [rel];
  });
}

describe.each(ids)('templates/%s', (id) => {
  const dir = join(templatesDir, id);
  const manifest = JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'));

  it('has a sound manifest', () => {
    expect(manifestProblems(manifest, id)).toEqual([]);
  });

  it('names no sibling template, no hub file and no spec-workflow artifact', () => {
    const siblings = ids.filter((other) => other !== id);
    for (const rel of sourceFiles(dir)) {
      const text = readFileSync(join(dir, rel), 'utf8');
      for (const sibling of siblings)
        expect(text, `${rel} names ${sibling}`).not.toContain(sibling);
      expect(text, `${rel} names a templates/ path`).not.toMatch(/templates\//);
      expect(text, `${rel} names a hub/ path`).not.toMatch(/(^|[\s`'"(])hub\//);
      expect(text, `${rel} names the spec workflow`).not.toMatch(
        /speckit|spec[- ]kit|\.specify|specs\/\d/i,
      );
    }
  });
});

describe('the registry', () => {
  const registry = readRegistry(join(repoRoot, 'hub'));

  it('names only templates that exist, each in the role its manifest declares', () => {
    for (const [role, { options }] of Object.entries<{
      options: Record<string, { template: string }>;
    }>(registry.roles)) {
      for (const { template } of Object.values(options)) {
        expect(ids, `${role} → ${template}`).toContain(template);
        const manifest = JSON.parse(
          readFileSync(join(templatesDir, template, 'template.json'), 'utf8'),
        );
        expect(manifest.role).toBe(role);
      }
    }
  });

  it('gives a role a flag exactly when it has more than one option', () => {
    for (const [role, { flag, options }] of Object.entries<{
      flag: string | null;
      options: object;
    }>(registry.roles)) {
      expect(flag === null, role).toBe(Object.keys(options).length === 1);
    }
  });
});
