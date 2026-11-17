// Shared by the hub's tests: scratch copies of this repo, composing them, and running what results.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Paths a fresh clone of this repo would not have (installs, builds, local env files, git). */
const NOT_IN_A_CLONE =
  /(^|\/)(node_modules|dist|coverage|out|bin|obj|\.git)(\/|$)|(^|\/)\.env\.[^/]*$|(^|\/)server\/public(\/|$)/;

/** Copies this repo, as a fresh clone would hold it, to `dest`. */
export function copyRepo(dest: string): void {
  cpSync(repoRoot, dest, {
    recursive: true,
    filter: (src) => !NOT_IN_A_CLONE.test(src.slice(repoRoot.length)),
  });
}

/** A scratch copy of this repo, in a new temporary folder (real path, so it matches `cwd`). */
export function freshCopy(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  copyRepo(dir);
  return dir;
}

/** Runs the hub resolver in `dir`. */
export function runInit(dir: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync('node', ['hub/init.mjs', ...args], { cwd: dir, encoding: 'utf8', env });
}

/**
 * Points each composed part's node_modules at the installed template it came from, so a composed
 * app runs without installing anything again (`npm run setup` in this repo installs the templates).
 */
export function linkInstalls(dir: string, parts: Record<string, string>): void {
  for (const [folder, templateId] of Object.entries(parts)) {
    const installed = join(repoRoot, 'templates', templateId, 'node_modules');
    if (existsSync(installed)) symlinkSync(installed, join(dir, folder, 'node_modules'));
  }
}

/** Runs an npm script in `dir`, returning its exit status and output. */
export function npm(dir: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync('npm', args, { cwd: dir, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
}

/** Starts a long-running command in its own process group, so `stop` ends everything it started. */
export function startGroup(dir: string, command: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawn(command, args, { cwd: dir, env, stdio: 'ignore', detached: true });
}

/** Ends a process group started by `startGroup`. */
export function stop(child: ChildProcess | undefined): void {
  if (child?.pid === undefined) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}

/** Resolves once `url` answers 200, or throws after `timeoutMs`. */
export async function waitFor(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`${url} did not answer within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Removes a scratch folder. */
export function remove(dir: string | undefined): void {
  if (dir) rmSync(dir, { recursive: true, force: true });
}
