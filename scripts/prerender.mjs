/**
 * Injects prerendered markup into the built HTML. For each prerender entry, renders
 * its element to a string and replaces the placeholder in the corresponding emitted
 * HTML file with that markup, so build-time content ships as real HTML rather than
 * an empty shell.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Provide the same version constants the Vite bundle bakes in via `define`, so the
// prerendered HTML matches what the client renders (no hydration mismatch). The
// prerender runs under tsx (no Vite defines), so we set them as globals from the same
// env the build uses. Must be set BEFORE importing the app.
const isBuildServer = process.env.CI === 'true';
globalThis.__APP_VERSION__ = isBuildServer
  ? JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
      .version
  : '0.0.0-dev';
globalThis.__GIT_COMMIT__ = process.env.BUILD_GIT_COMMIT ?? 'dev';
globalThis.__BUILD_DATE__ = process.env.BUILD_DATE ?? 'dev';
globalThis.__IS_PRODUCTION__ = process.env.NODE_ENV === 'production';

const { entries, renderEntry } = await import('../src/web/prerender.ts');

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const PLACEHOLDER = '<!--app-html-->';

for (const entry of entries) {
  const file = `${distDir}/${entry.html}`;
  const template = await readFile(file, 'utf8');
  const markup = renderEntry(entry);

  if (!template.includes(PLACEHOLDER)) {
    throw new Error(`Prerender placeholder not found in ${entry.html}; expected ${PLACEHOLDER}`);
  }

  await writeFile(file, template.replace(PLACEHOLDER, markup), 'utf8');
  console.log(`Prerendered ${entry.html}`);
}
