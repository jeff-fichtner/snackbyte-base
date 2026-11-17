/**
 * The template stamp (`.template.json`): which template an app came from and at which version, so
 * the fleet's map can show how far behind the template it is (format: snackbyte-ops
 * docs/template-stamp.md). And the cleanup of the template's own release tags, which a clone
 * inherits.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const TEMPLATE = 'snackbyte-base';
const TEMPLATE_URL = 'https://github.com/jeff-fichtner/snackbyte-base.git';
const RELEASE_TAG = /^v(\d+\.\d+\.\d+)(?:-dev)?$/;

// A credential prompt would wait unseen behind the piped output; fail at once instead.
const git = (argv, cwd) =>
  spawnSync('git', argv, {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });

/** The newest release among `repo`'s tags whose tree is `tree`, and how many releases it read. */
function releaseWithTree(repo, tree) {
  const tags = (git(['tag', '-l', 'v*'], repo).stdout ?? '')
    .split('\n')
    .filter((t) => RELEASE_TAG.test(t));
  const trees = tags.length
    ? (git(['rev-parse', ...tags.map((t) => `${t}^{tree}`)], repo).stdout ?? '').split('\n')
    : [];
  const matching = tags
    .filter((_, i) => trees[i] === tree)
    .map((t) => RELEASE_TAG.exec(t)[1])
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  return { read: tags.length, version: matching[0] ?? null };
}

/**
 * The template version the app in `root` was made from, found and never guessed: the template
 * release whose tree is exactly the app's committed tree. Run it before anything changes the tree.
 *   - A clone of the template carries the template's tags, so they are checked first.
 *   - A "Create from template" repo carries none, but its first commit holds exactly the template's
 *     tree, so the template's own tags are read from GitHub.
 * A `-dev` tag counts as the release it is promoted to, since release-flow reuses the number. The
 * app's tree is its own directory's, so an app nested in a larger repo is matched on itself. When
 * nothing matches, the version is `null`, the format's recorded unknown, with the reason.
 *
 * @param {string} root the app's directory
 * @returns {{ version: string | null, why: string }}
 */
export function findTemplateVersion(root) {
  if (git(['rev-parse', '--is-inside-work-tree'], root).stdout?.trim() !== 'true') {
    return { version: null, why: 'this directory is not a git repository' };
  }
  const prefix = git(['rev-parse', '--show-prefix'], root).stdout?.trim() ?? '';
  const tree = git(['rev-parse', '--verify', '-q', `HEAD:${prefix}`], root).stdout?.trim();
  if (!tree) return { version: null, why: 'the app has no commit yet' };

  const local = releaseWithTree(root, tree).version;
  if (local !== null) return { version: local, why: '' };

  // A throwaway repository holds the template's tags, so none of its objects land here. Only
  // commits are fetched: a commit names its tree, which is all the match needs.
  const scratch = mkdtempSync(resolve(tmpdir(), 'template-stamp-'));
  try {
    git(['init', '-q', '--bare'], scratch);
    const fetched = git(
      ['fetch', '-q', '--depth=1', '--filter=tree:0', TEMPLATE_URL, '+refs/tags/v*:refs/tags/v*'],
      scratch,
    );
    if (fetched.status !== 0) return { version: null, why: `could not fetch ${TEMPLATE}'s tags` };
    const found = releaseWithTree(scratch, tree);
    if (found.version !== null) return { version: found.version, why: '' };
    return {
      version: null,
      why:
        found.read === 0
          ? `${TEMPLATE} has no release tags`
          : `the app matches no ${TEMPLATE} release (changed since it was created?)`,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Writes `.template.json` at `root`. */
export function writeStamp(root, version) {
  writeFileSync(
    resolve(root, '.template.json'),
    JSON.stringify({ template: TEMPLATE, version }, null, 2) + '\n',
  );
}

/**
 * Removes the template's release tags from a clone. Left in place they would make the app's first
 * release derive its number from the template's history instead of starting a clean v0.1.0, and
 * pollute the app's history with releases that were never its own. A "Create from template" repo has
 * none; only this clone's local tags are touched, never anything pushed.
 */
export function stripTemplateTags(root) {
  if (git(['rev-parse', '--is-inside-work-tree'], root).stdout?.trim() !== 'true') return;
  const tags = (git(['tag', '-l'], root).stdout ?? '')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length > 0) git(['tag', '-d', ...tags], root);
}
