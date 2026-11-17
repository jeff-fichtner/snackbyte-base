/**
 * Check gate (`npm run check:env`, part of check:all): every tracked env file may hold only
 * 1Password references (op://…), empty values, and keys the file declares as plain config on a
 * `# config: KEY KEY …` line. A raw value anywhere else fails the gate, so a secret pasted into a
 * committed `.env` never gets past CI. Example files are checked too.
 *
 * Reports file, line and key for each finding. It never prints a value.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { findRawValues, isCheckedEnvFile } from './lib/env-guard.mjs';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const envFiles = tracked.filter(isCheckedEnvFile);

const problems = envFiles.flatMap((file) =>
  findRawValues(readFileSync(file, 'utf8')).map(
    (finding) =>
      `  ${file}:${finding.line}${finding.key ? ` ${finding.key}` : ''}: ${finding.reason}`,
  ),
);

if (problems.length > 0) {
  console.error(
    [
      'check:env FAILED: a tracked env file holds a value that is not a 1Password reference.',
      ...problems,
      'Move a secret into 1Password and reference it (op://app-secrets/<repo>.<env>/<KEY>), or, if',
      "it is plain config, add the key to that file's `# config:` line.",
    ].join('\n'),
  );
  process.exit(1);
}

console.log(
  `check:env OK: ${envFiles.length} tracked env file(s) hold only op:// references and declared config.`,
);
