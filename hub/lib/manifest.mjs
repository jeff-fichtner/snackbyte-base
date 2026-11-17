/**
 * Reads and checks the templates' manifests (`templates/<id>/template.json`) and the hub's registry.
 *
 * A manifest's commands are written from the root of whatever holds the template, with `{dir}` for
 * the template's folder: `templates/<id>` when the hub runs a template's gate, the part's folder
 * (`web`, `server`) in a composed app's root scripts. The resolver command is the exception: it runs
 * from inside the template's folder.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROLES = ['web', 'server', 'deploy'];
const DIR_COMMANDS = ['setup', 'dev', 'check', 'build', 'start'];
const REQUIRED_BY_ROLE = {
  web: ['build', 'check', 'setup', 'output'],
  server: ['build', 'check', 'setup', 'start', 'webRoot', 'image'],
  deploy: ['check', 'setup', 'ships'],
};

/** The registry of roles and their options. */
export function readRegistry(hubDir) {
  return JSON.parse(readFileSync(resolve(hubDir, 'registry.json'), 'utf8'));
}

/**
 * The problems with a manifest, as messages (empty when it is sound).
 *
 * @param {Record<string, unknown>} manifest
 * @param {string} folderName the template's folder name, which its id must equal
 */
export function manifestProblems(manifest, folderName) {
  const problems = [];
  const where = `templates/${folderName}/template.json`;
  if (manifest.id !== folderName) problems.push(`${where}: id must be "${folderName}"`);
  if (!ROLES.includes(manifest.role)) problems.push(`${where}: role must be one of ${ROLES}`);
  if (typeof manifest.folder !== 'string' || manifest.folder === '') {
    problems.push(`${where}: folder is required`);
  }
  for (const key of REQUIRED_BY_ROLE[manifest.role] ?? []) {
    if (manifest[key] === undefined)
      problems.push(`${where}: ${key} is required for a ${manifest.role}`);
  }
  for (const key of DIR_COMMANDS) {
    const command = manifest[key];
    if (command === undefined) continue;
    if (typeof command !== 'string' || !command.includes('{dir}')) {
      problems.push(`${where}: ${key} must be a command that names its folder as {dir}`);
    }
  }
  if (manifest.resolve !== undefined && typeof manifest.resolve !== 'string') {
    problems.push(`${where}: resolve must be a command`);
  }
  for (const [choice, values] of Object.entries(manifest.choices ?? {})) {
    if (!Array.isArray(values) || values.length === 0) {
      problems.push(`${where}: choices.${choice} must list its accepted values`);
    }
  }
  return problems;
}

/**
 * Reads the manifest of the template in `templateDir`; throws listing every problem.
 *
 * @param {string} templateDir the template's folder
 * @param {string} folderName its folder name under templates/
 */
export function readManifest(templateDir, folderName) {
  const file = resolve(templateDir, 'template.json');
  if (!existsSync(file)) throw new Error(`templates/${folderName} has no template.json`);
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const problems = manifestProblems(manifest, folderName);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return manifest;
}

/** A manifest command with its folder filled in. */
export function inFolder(command, dir) {
  return command.replaceAll('{dir}', dir);
}
