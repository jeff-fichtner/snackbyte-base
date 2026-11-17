/**
 * Finds a file this project reads from exactly two places: its own folder, then the folder above.
 *
 * On its own, the project holds its own copy (its committed `.env`, its `environments.json`).
 * Inside an app that has several parts, the app keeps one copy at its root, the folder above, and
 * every part reads that one. Looking in exactly those two places keeps the lookup inside the app:
 * it never wanders up into whatever happens to contain it.
 *
 * The project's folder is the working directory: npm runs every script from the folder holding its
 * package.json, and so does `npm --prefix <folder>`.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The places `name` is looked for, in order, and the first that exists (undefined when neither).
 *
 * @param {string} name a file name, e.g. `environments.json`
 * @param {string} [root] the project folder to look from; the working directory unless given
 * @returns {{ found: string | undefined, candidates: string[] }}
 */
export function findUpOne(name, root = process.cwd()) {
  const candidates = [resolve(root, name), resolve(root, '..', name)];
  return { found: candidates.find((candidate) => existsSync(candidate)), candidates };
}
