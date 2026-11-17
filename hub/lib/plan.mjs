/**
 * Turns the person's flags into a composition: which template fills each role, with which of its own
 * choices. Everything is checked here, before any file changes, so a refused run leaves the copy as
 * it was.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readManifest, readRegistry } from './manifest.mjs';

/** Parses `--key=value` arguments; a bare `--key` is `true`. */
export function parseFlags(argv) {
  return Object.fromEntries(
    argv.map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, '').split('=');
      return [key, rest.length > 0 ? rest.join('=') : true];
    }),
  );
}

/** Whether the chosen server option has an API (false while the choice is missing or invalid). */
function appHasApi(registry, flags) {
  const server = registry.roles.server;
  return server.options[flags[server.flag]]?.hasApi === true;
}

/**
 * @param {string} root the copy of snackbyte-base being composed
 * @param {Record<string, string | true>} flags
 * @returns {{ problems: string[], usage: string, name?: string,
 *   parts: { role: string, option: string, templateId: string, summary: string,
 *            hasApi?: boolean, manifest: Record<string, any>, resolveArgs: string[] }[] }}
 */
export function plan(root, flags) {
  const hubDir = resolve(root, 'hub');
  const registry = readRegistry(hubDir);
  const problems = [];
  const parts = [];
  const known = new Set(['name']);
  const usageParts = [];

  for (const [role, { flag, options }] of Object.entries(registry.roles)) {
    const names = Object.keys(options);
    let option;
    if (flag === null) {
      option = names[0];
    } else {
      known.add(flag);
      usageParts.push(`--${flag}=<${names.join('|')}>`);
      const value = flags[flag];
      if (value === undefined) problems.push(`--${flag} is required: ${names.join(', ')}`);
      else if (!names.includes(value)) problems.push(`--${flag} must be one of ${names.join(', ')}`);
      else option = value;
    }
    if (option === undefined) continue;

    const { template: templateId, hasApi, summary } = options[option];
    const templateDir = resolve(root, 'templates', templateId);
    if (!existsSync(templateDir)) {
      problems.push(`templates/${templateId} is missing (${role} ${option})`);
      continue;
    }
    let manifest;
    try {
      manifest = readManifest(templateDir, templateId);
    } catch (error) {
      problems.push(error.message);
      continue;
    }

    const resolveArgs = [];
    for (const [choice, values] of Object.entries(manifest.choices ?? {})) {
      known.add(choice);
      usageParts.push(`--${choice}=<${values.join('|')}>`);
      const value = flags[choice];
      if (value === undefined) problems.push(`--${choice} is required: ${values.join(', ')}`);
      else if (!values.includes(value)) problems.push(`--${choice} must be one of ${values.join(', ')}`);
      else resolveArgs.push(`--${choice}=${value}`);
    }
    if (manifest.hasApi) {
      // Whether the app has an API is the server option's to say; every part that cares is told.
      resolveArgs.push(`--api=${appHasApi(registry, flags) ? 'yes' : 'no'}`);
    }
    parts.push({ role, option, templateId, summary, hasApi, manifest, resolveArgs });
  }

  for (const key of Object.keys(flags)) {
    if (!known.has(key)) problems.push(`--${key} is not a choice the hub takes`);
  }
  const name = flags.name;
  if (typeof name !== 'string' || name.trim() === '') {
    problems.push('--name is required: the repo slug, e.g. --name=my-app');
  }
  usageParts.push('--name=<repo-slug>');

  return {
    problems,
    usage: `Usage: npm run init -- ${usageParts.join(' ')}`,
    name: typeof name === 'string' ? name : undefined,
    parts,
  };
}
