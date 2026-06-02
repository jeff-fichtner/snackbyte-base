/**
 * Injects prerendered markup into the built HTML. For each prerender entry, renders
 * its element to a string and replaces the placeholder in the corresponding emitted
 * HTML file with that markup, so build-time content ships as real HTML rather than
 * an empty shell.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { entries, renderEntry } from '../src/web/prerender.ts';

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
