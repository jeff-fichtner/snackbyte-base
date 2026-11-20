/**
 * Composes an app in place from a plan (see plan.mjs): moves the chosen templates into their
 * folders, runs each one's resolver, writes the files that belong to the combination at the app
 * root, and removes everything that is not the app — the unused templates, the hub, the spec
 * workflow, the template's own CI.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inFolder, readManifest } from './manifest.mjs';
import { stripTemplateTags, writeStamp } from './stamp.mjs';

/** Writes `text` to `file`, creating its folder. */
function write(file, text) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, text);
}

/** Removes a directory only when it exists and is empty. */
function removeIfEmpty(dir) {
  if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
}

/**
 * @param {string} root the copy of snackbyte-base being composed
 * @param {{ name: string, parts: ReturnType<typeof import('./plan.mjs').plan>['parts'] }} composition
 * @param {string | null} version the template version found before anything moved
 */
export function compose(root, { name, parts }, version) {
  const at = (...p) => resolve(root, ...p);
  const hubFiles = at('hub', 'files');

  // 1. Move each template into its place.
  for (const part of parts) {
    const source = at('templates', part.templateId);
    if (part.manifest.folder === '.') {
      for (const file of part.manifest.ships) renameSync(resolve(source, file), at(file));
    } else {
      renameSync(source, at(part.manifest.folder));
    }
  }
  const folderParts = parts.filter((p) => p.manifest.folder !== '.');

  // 2. Each template resolves its own choices.
  for (const part of folderParts) {
    if (!part.manifest.resolve) continue;
    const [command, ...args] = part.manifest.resolve.split(' ');
    const run = spawnSync(command, [...args, ...part.resolveArgs, `--name=${name}`], {
      cwd: at(part.manifest.folder),
      encoding: 'utf8',
    });
    if (run.status !== 0) {
      throw new Error(`${part.templateId}'s resolver failed:\n${run.stdout}${run.stderr}`);
    }
  }

  // 3. Re-read each part's manifest (a resolver may have changed it), then leave only the part an
  //    app owns: no manifest, no template-facing README or scaffolding, and no .env or
  //    environments.json of its own (the app root holds the one copy of each).
  const byRole = {};
  for (const part of folderParts) {
    const dir = at(part.manifest.folder);
    const manifest = readManifest(dir, part.templateId);
    byRole[part.role] = { ...part, manifest };
    for (const rel of [
      ...(manifest.scaffolding ?? []),
      'template.json',
      'README.md',
      '.env',
      'environments.json',
    ]) {
      rmSync(resolve(dir, rel), { recursive: true, force: true });
    }
    if (manifest.appReadme) renameSync(resolve(dir, manifest.appReadme), resolve(dir, 'README.md'));
    for (const rel of ['package.json', 'package-lock.json']) {
      const file = resolve(dir, rel);
      if (!existsSync(file)) continue;
      const json = JSON.parse(readFileSync(file, 'utf8'));
      json.name = `${name}-${manifest.folder}`;
      if (json.packages?.['']) json.packages[''].name = json.name;
      writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    }
  }
  const { web, server } = byRole;
  const cmd = (part, key) => inFolder(part.manifest[key], part.manifest.folder);

  // 4. The app root: its scripts, its one .env, the image recipe for its server, its README.
  const hubPackage = JSON.parse(readFileSync(at('package.json'), 'utf8'));
  // Each part's command is its own script, run with `npm run`, so it gets a fresh shell at the app
  // root: a part whose command starts with `cd <part> &&` cannot move the next command elsewhere.
  const scripts = {
    setup: 'npm run setup:web && npm run setup:server',
    'setup:web': cmd(web, 'setup'),
    'setup:server': cmd(server, 'setup'),
    dev: 'node scripts/dev.mjs',
    ...Object.fromEntries(
      [web, server].filter((p) => p.manifest.dev).map((p) => [`dev:${p.role}`, cmd(p, 'dev')]),
    ),
    build: `npm run build:web && npm run build:server && node scripts/copy-web.mjs ${cmd(web, 'output')} ${cmd(server, 'webRoot')}`,
    'build:web': cmd(web, 'build'),
    'build:server': cmd(server, 'build'),
    start: cmd(server, 'start'),
    'check:env': 'node scripts/check-env-files.mjs',
    'check:web': cmd(web, 'check'),
    'check:server': cmd(server, 'check'),
    'check:all': 'npm run check:env && npm run check:web && npm run check:server',
  };
  const appPackage = {
    name,
    version: '0.1',
    private: true,
    type: 'module',
    description: `${name} — a snackbyte app.`,
    engines: hubPackage.engines,
    scripts,
  };
  write(at('package.json'), JSON.stringify(appPackage, null, 2) + '\n');
  write(
    at('package-lock.json'),
    JSON.stringify(
      {
        name,
        version: '0.1',
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name, version: '0.1', engines: hubPackage.engines } },
      },
      null,
      2,
    ) + '\n',
  );

  const config = { ...(server.manifest.env ?? {}) };
  if (server.hasApi) config.API_URL = `http://localhost:${config.PORT}`;
  write(at('.env'), appEnv(name, config));

  cpSync(resolve(hubFiles, 'scripts'), at('scripts'), { recursive: true });
  cpSync(resolve(hubFiles, `Dockerfile.${server.manifest.image}`), at('Dockerfile'));
  cpSync(resolve(hubFiles, 'dockerignore'), at('.dockerignore'));
  cpSync(resolve(hubFiles, 'gitignore'), at('.gitignore'));
  const partLines = parts
    .map((p) =>
      p.manifest.folder === '.'
        ? `- ${p.summary}.`
        : `- [\`${p.manifest.folder}/\`](${p.manifest.folder}/README.md) — ${p.summary}.`,
    )
    .join('\n');
  const readme = readFileSync(resolve(hubFiles, 'README.app.md'), 'utf8')
    .replaceAll('APP_NAME', name)
    .replace('<!-- PARTS -->', partLines);
  write(at('README.md'), readme);
  writeStamp(root, version);

  // 5. Everything that is not the app goes: the unused templates, the hub, its tooling and docs,
  //    the spec workflow, the template's own CI (an app installs its own, from the release flow's
  //    docs), and the template's release tags.
  for (const rel of [
    'templates',
    'hub',
    'specs',
    '.specify',
    'CLAUDE.md',
    'SPIN-UP.md',
    'SUBDIR-LAYOUT.md',
    'config',
    'eslint.config.js',
    'tsconfig.json',
    'vitest.config.ts',
    'node_modules',
    '.github/workflows/ci-cd.yml',
    '.github/dependabot.yml',
  ]) {
    rmSync(at(rel), { recursive: true, force: true });
  }
  removeIfEmpty(at('.github/workflows'));
  removeIfEmpty(at('.github'));
  // `.claude/` may also hold settings the person wrote before spinning up: take out only the spec
  // workflow's skills, and the folders only once they are empty.
  const skills = at('.claude/skills');
  if (existsSync(skills)) {
    for (const entry of readdirSync(skills)) {
      if (entry.startsWith('speckit-')) rmSync(resolve(skills, entry), { recursive: true });
    }
  }
  removeIfEmpty(skills);
  removeIfEmpty(at('.claude'));
  stripTemplateTags(root);
}

/** The app's committed .env: the one local environment every part reads. */
export function appEnv(name, config) {
  const keys = Object.keys(config);
  const comments = {
    PORT: 'Port the server listens on.',
    API_URL: 'The server the web dev server forwards /api requests to (the PORT above).',
  };
  const lines = keys.map((key) => `# ${comments[key] ?? key}\n${key}=${config[key]}`).join('\n\n');
  return `# Local development environment for ${name}. Committed: it documents every variable the app
# reads locally. Every part of the app (web/, server/) reads this one file. Every value here is
# plain local config, declared on the config line below; a secret never appears here as a value.
#
# To add a secret: create the 1Password item ${name}.local in the vault app-secrets, with one field
# named after the variable, then add its reference here:
#   KEY=op://app-secrets/${name}.local/KEY
# From then on, run the dev server under op run:
#   op run --env-file=.env -- npm run dev
# Without op run, the dev and build scripts stop at startup and name the unresolved variable. A raw
# value for a key that is not on the config line below fails the check gate (npm run check:env).
# config: ${keys.join(' ')}
#
# Production never reads this file: Cloud Run injects PORT and holds the rest of the service's
# configuration.

${lines}
`;
}
