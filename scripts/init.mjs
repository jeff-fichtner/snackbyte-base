/**
 * One-time spin-up resolver. Bakes the app into a single deploy mode and removes all
 * template scaffolding — including itself. Run once, right after creating a repo from
 * this template:
 *
 *   node scripts/init.mjs --mode=<static|server> --render=<prerender|dynamic> [--name=<app-name>]
 *
 * Both --mode and --render are required (the resolver exits non-zero without either).
 * It is intentionally specific and non-defensive: it runs once against the pristine
 * template (a known state), then deletes itself, so it never sees a modified repo.
 *
 *   static → serves a frontend with no API. Deletes src/routes and strips the
 *            server-only marker blocks (which include the dev API proxy in
 *            vite.config.ts and the dev API process in scripts/dev.mjs). (An
 *            Express server still serves the built files.)
 *   server → serves the frontend AND an Express API under /api.
 *
 *   prerender → content rendered to real HTML at build time.
 *   dynamic   → client-side rendering; no prerender step.
 *
 * After it runs there is no "mode"/"render" concept left: the app simply is what it
 * is. Switching later is a documented code edit (see the template's docs), not a flag.
 */
import { readFileSync, readdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = (p) => resolve(root, p);

// ---- args ------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const USAGE =
  'Usage: node scripts/init.mjs --mode=<static|server> --render=<prerender|dynamic> --name=<repo-slug>';
const mode = args.mode;
const render = args.render;
if (mode !== 'static' && mode !== 'server') {
  console.error(USAGE);
  process.exit(1);
}
if (render !== 'prerender' && render !== 'dynamic') {
  console.error(USAGE);
  process.exit(1);
}
// --name is required: without it the app would silently keep the template's name
// (snackbyte-base) in package.json, the README, the lockfile, and the page title.
if (typeof args.name !== 'string' || args.name.trim() === '') {
  console.error('Error: --name is required (the repo slug, e.g. --name=my-app).');
  console.error(USAGE);
  process.exit(1);
}

// ---- marker resolution -----------------------------------------------------
// Resolve `SPINUP:<axis>-only` blocks: keep the code (strip just the marker comments)
// when the app is that variant, or delete the whole block when it isn't.
function resolveMarkers(rel, axis, keep) {
  const file = path(rel);
  if (!existsSync(file)) return;
  let text = readFileSync(file, 'utf8');
  const start = new RegExp(`[ \\t]*(?://|#)\\s*SPINUP:${axis}:start.*\\n`, 'g');
  const end = new RegExp(`[ \\t]*(?://|#)\\s*SPINUP:${axis}:end.*\\n`, 'g');
  const block = new RegExp(
    `[ \\t]*(?://|#)\\s*SPINUP:${axis}:start[\\s\\S]*?SPINUP:${axis}:end.*\\n`,
    'g',
  );
  text = keep ? text.replace(start, '').replace(end, '') : text.replace(block, '');
  writeFileSync(file, text);
}

// server-only axis (across these files); prerender-only axis (in build.mjs).
for (const rel of ['src/server.ts', 'vite.config.ts', 'scripts/dev.mjs']) {
  resolveMarkers(rel, 'server-only', mode === 'server');
}
resolveMarkers('scripts/build.mjs', 'prerender-only', render === 'prerender');

// ---- static-only deletions -------------------------------------------------
if (mode === 'static') {
  rmSync(path('src/routes'), { recursive: true, force: true });
}

// ---- dynamic-only deletions (no prerender step) ----------------------------
if (render === 'dynamic') {
  rmSync(path('src/web/prerender.ts'), { force: true });
  rmSync(path('scripts/prerender.mjs'), { force: true });
}

// ---- re-tier tests ---------------------------------------------------------
// The template proves its own plumbing in tests/machinery (deleted now). The app
// keeps tests/app: an example plus the smoke test matching its mode. Vitest is
// pointed at tests/app.
rmSync(path('tests/machinery'), { recursive: true, force: true });
if (mode === 'server') {
  rmSync(path('tests/app/static-smoke.test.ts'), { force: true });
} else {
  rmSync(path('tests/app/server-smoke.test.ts'), { force: true });
}
{
  const cfg = path('vite.config.ts');
  let text = readFileSync(cfg, 'utf8');
  text = text.replace(/tests\/machinery\//g, 'tests/app/');
  writeFileSync(cfg, text);
}

// ---- remove the CI release workflow ----------------------------------------
// The template runs its own CI from `.github/workflows/ci-cd.yml` (that is where snackbyte-base's
// own version tags come from), but it does NOT hand that workflow to the apps it spins up. CI is
// installed per repo, on its own schedule, from the release-flow Action's own CONSUMING.md — the
// authoritative source for the wiring, the `@v1` pin, and the app-vs-library version-strategy
// choice. A copy shipped inside the template would be a second, staler copy of that wiring.
//
// `environments.json` deliberately stays: it is app build input (scripts/build.mjs generates
// src/env.generated.ts from it), not release-flow-only config. So does the app-side runtime half
// (scripts/resolve-env.mjs, src/environments.ts) — only the CI file goes.
//
// Remove the directories only once they are empty, so an app that already had its own
// `.github/` content (issue templates, CODEOWNERS) keeps it.
{
  rmSync(path('.github/workflows/ci-cd.yml'), { force: true });
  rmSync(path('.github/workflows/ci-cd.yml.disabled'), { force: true });
  for (const rel of ['.github/workflows', '.github']) {
    const dir = path(rel);
    if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  }
}

// ---- rename the package ----------------------------------------------------
if (typeof args.name === 'string') {
  const pkgPath = path('package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = args.name;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

// ---- remove the init script line + template description, reset version -----
// The app starts its own version line at MAJOR.MINOR 0.1 (not the template's version).
// package.json holds only MAJOR.MINOR; the PATCH is derived from git tags once a release flow
// is wired up, so the app's first release is v0.1.0. Bump MAJOR.MINOR by hand for a
// meaningful release.
const pkgPath = path('package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
delete pkg.scripts.init;
// Spec-driven-development tooling is not part of the app (see the removal block below).
// spec-render turns `specs/**/*.md` into HTML views — with no `specs/` to render, both
// scripts and the dependency are dead weight, so they go with it.
delete pkg.scripts['spec:html'];
delete pkg.scripts['spec:html:watch'];
delete pkg.devDependencies['@snackbyte/spec-render'];
// Derive a placeholder description from the name rather than blanking it (the app owner
// can refine it, but a blank description is worse than a sensible stub).
pkg.description = `${pkg.name} — a snackbyte app.`;
pkg.version = '0.1';
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Sync package-lock.json to match package.json — its name/version (otherwise the lockfile
// keeps the template's, a surviving fingerprint and a stale version number) and the
// dependency we just dropped. The lockfile edit is not cosmetic: `npm ci` — which both CI
// and the Dockerfile use — refuses to install when package.json and package-lock.json
// disagree, so a lock still declaring @snackbyte/spec-render would fail the app's first
// build. Done in-process so it cannot depend on a network or a warm npm cache.
{
  const lockPath = path('package-lock.json');
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.name = pkg.name;
    lock.version = pkg.version;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].name = pkg.name;
      lock.packages[''].version = pkg.version;
      delete lock.packages['']?.devDependencies?.['@snackbyte/spec-render'];
      delete lock.packages['node_modules/@snackbyte/spec-render'];
    }
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  }
}

// Tidy the transitive entries spec-render left behind (markdown-it, highlight.js, …).
// `npm ci` already ignores unreachable entries — the lock above is correct without this —
// so this is a cleanliness pass only, and a failure is reported rather than fatal.
{
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const tidy = spawnSync(
    npmBin,
    ['install', '--package-lock-only', '--prefer-offline', '--ignore-scripts', '--no-audit'],
    { cwd: root, stdio: 'ignore' },
  );
  if (tidy.status !== 0) {
    console.warn(
      'Note: could not re-resolve package-lock.json; it keeps a few unused entries.\n' +
        '      Harmless — run `npm install --package-lock-only` to tidy them.',
    );
  }
}

// ---- strip the template's inherited git tags -------------------------------
// The version reset above (0.1) only sets MAJOR.MINOR; the PATCH is derived from existing git tags
// whenever a release flow is wired up. A "Create from template" repo carries no tags, but a clone
// or fork inherits ALL of the template's release tags (v1.0.0 … v1.2.x). Left in place those would
// make the app's first release derive vMM.<max+1> off the template's history instead of a clean
// v0.1.0 — and pollute the app's history with releases that were never its own. So they go now,
// at resolve time, rather than lying in wait until CI is installed. Best-effort: no git, no remote,
// or no tags is fine (a template-created repo has none); only this clone's local tags are touched,
// never anything already pushed.
{
  const inGit =
    spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: root,
      encoding: 'utf8',
    }).stdout?.trim() === 'true';
  if (inGit) {
    const tags =
      spawnSync('git', ['tag', '-l'], { cwd: root, encoding: 'utf8' })
        .stdout?.split('\n')
        .map((t) => t.trim())
        .filter(Boolean) ?? [];
    if (tags.length > 0) {
      spawnSync('git', ['tag', '-d', ...tags], { cwd: root, stdio: 'ignore' });
    }
  }
}

// ---- swap in the forward-facing app README, drop template docs -------------
// The app gets its own README (no template/skeleton language); the template README and the
// template-only handoff/guidance docs are removed. SPIN-UP.md (the resolver handoff) and
// SUBDIR-LAYOUT.md (a pre-spin-up layout decision) are both about getting FROM the template TO
// an app — neither is part of the resolved app, so leaving them would clutter every spun-up
// repo's root with docs it can't act on.
const appName = typeof args.name === 'string' ? args.name : pkg.name;
const appReadme = readFileSync(path('README.app.md'), 'utf8').replace(/APP_NAME/g, appName);
writeFileSync(path('README.md'), appReadme);
rmSync(path('README.app.md'), { force: true });
for (const rel of ['SPIN-UP.md', 'SUBDIR-LAYOUT.md']) {
  if (existsSync(path(rel))) rmSync(path(rel), { force: true });
}

// Set the page <title> to the app name (the template ships a placeholder "App").
{
  const htmlPath = path('src/web/index.html');
  let html = readFileSync(htmlPath, 'utf8');
  html = html.replace(/<title>App<\/title>/, `<title>${appName}</title>`);
  writeFileSync(htmlPath, html);
}

// ---- remove the spec-driven-development scaffolding ------------------------
// The template develops itself with Spec Kit, but it does not install Spec Kit into the
// apps it spins up — that tooling is set up per repo on its own, so shipping a copy would
// hand every app a pinned fork of it that silently drifts out of date. So the whole
// workflow leaves with the transfer: the tooling (`.specify/`), its agent-skill mirrors
// (`.claude/`), the template's own specs and constitution (`specs/`), and the agent
// instructions that reference them (`CLAUDE.md` — the template guard is its only other
// content, and that goes too now that this is a normal app meant to be edited).
//
// Nothing here is left behind as a stub: an app that wants the workflow runs `specify
// init` (plus `/speckit-constitution`), which installs the current version configured for
// that app — strictly better than inheriting the copy the template happened to carry.
for (const rel of ['.specify', 'specs']) {
  rmSync(path(rel), { recursive: true, force: true });
}
rmSync(path('CLAUDE.md'), { force: true });

// `.claude/` holds only the speckit skill mirrors in the template, but it is also where an
// agent keeps settings the person may already have written in this repo before spinning up.
// So take out the speckit skills by name and remove the directories only once they are
// empty — never blow away a `.claude/` that has something else in it.
{
  const skills = path('.claude/skills');
  if (existsSync(skills)) {
    for (const entry of readdirSync(skills)) {
      if (entry.startsWith('speckit-')) rmSync(resolve(skills, entry), { recursive: true });
    }
  }
  for (const rel of ['.claude/skills', '.claude']) {
    const dir = path(rel);
    if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  }
}

// The ignore rules that named those paths go with them. Left behind they are entries for
// directories that cannot exist — dead config, and the last place the workflow would still
// be visible in an app that has no idea what it is.
const unstripped = [];
for (const [rel, pattern] of [
  // the generated HTML spec views + the ClickUp plug's local target (no specs/, no plug left)
  ['.gitignore', /\n# Spec-workflow scaffolding[\s\S]*?config\.local\.yml\n/],
  ['.dockerignore', /\nspecs\/\n\.specify\/\n\.claude\/\n/],
  [
    'config/.prettierignore',
    /\n# Spec-workflow scaffolding[^\n]*\n\.specify\/\n\.claude\/\nspecs\/\nCLAUDE\.md\n/,
  ],
]) {
  const file = path(rel);
  // Report rather than throw. This runs near the END of the resolve — `.specify/`, `specs/`
  // and CLAUDE.md are already deleted by now — so aborting here would strand a half-resolved
  // repo, which is strictly worse than a stale ignore entry. But it must never pass silently:
  // these patterns are anchored on exact multi-line blocks, so an upstream edit to any of
  // these files makes the replace a no-op, and the only symptom would be a spun-up app
  // carrying ignore rules for directories it does not have.
  if (!existsSync(file)) {
    unstripped.push(`${rel} (missing)`);
    continue;
  }
  const before = readFileSync(file, 'utf8');
  const after = before.replace(pattern, '\n');
  if (after === before) {
    unstripped.push(rel);
    continue;
  }
  writeFileSync(file, after);
}
if (unstripped.length > 0) {
  console.warn(
    `Note: could not remove the spec-workflow block from: ${unstripped.join(', ')}.\n` +
      '      The resolve is otherwise complete — delete those entries by hand.',
  );
}

// ---- tidy formatting -------------------------------------------------------
// Deleting marker blocks can leave stray blank lines; reformat so the quality gate
// passes cleanly on the resolved app. This needs the local prettier, so say so when it
// isn't installed — otherwise the resolve looks clean but `npm run check:all` opens red
// on formatting, which reads as a broken template rather than a skipped `npm install`.
const prettierBin = path(`node_modules/.bin/prettier${process.platform === 'win32' ? '.cmd' : ''}`);
const formatted = spawnSync(
  prettierBin,
  [
    '--config',
    'config/.prettierrc.json',
    '--ignore-path',
    'config/.prettierignore',
    '--write',
    'src/**/*.{ts,tsx}',
    'scripts/**/*.mjs',
    'vite.config.ts',
  ],
  { cwd: root, stdio: 'ignore' },
);
if (formatted.status !== 0) {
  console.warn(
    'Note: prettier did not run, so the resolved source is not reformatted.\n' +
      '      Run `npm install && npm run format` before `npm run check:all`.',
  );
}

console.log(`Initialized as a ${mode} / ${render} app named "${appName}".`);
console.log('Removed template scaffolding. This repo is now your app.');

// ---- print the next steps --------------------------------------------------
// No CI is shipped with the app (see the workflow-removal block above), so there is nothing to
// authorize here. Point at the release-flow Action instead: its CONSUMING.md owns the wiring, the
// `@v1` pin, the app-vs-library version-strategy choice, AND the repo settings a tag-pushing
// workflow needs. Naming it keeps that knowledge in one place rather than half-copied into here.
{
  console.log('');
  console.log('Next:');
  console.log('  1. Verify:  npm run check:all  &&  npm run dev');
  console.log('  2. Commit this spin-up.');
  console.log('  3. This app ships no CI workflow. To add the release flow, follow');
  console.log('     CONSUMING.md in jeff-fichtner/snackbyte-release-flow-action.');
}

// ---- self-delete (last) ----------------------------------------------------
unlinkSync(fileURLToPath(import.meta.url));
