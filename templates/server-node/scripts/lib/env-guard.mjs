/**
 * Guards for env files whose secrets are 1Password references (`op://vault/item/field`).
 *
 * The committed `.env` files hold references, not values; `op run --env-file=<file> -- <cmd>`
 * resolves them into the environment of <cmd>. Two things must never happen, and each fails loud:
 *
 * - A process runs with an unresolved reference as a value (it was started without `op run`).
 *   `assertNoOpReferences` stops it at startup, naming the variables and the command to use,
 *   instead of letting an `op://…` string reach the app as a password or signing key.
 * - A raw value lands in a committed env file. `findRawValues` (run by the check gate, see
 *   scripts/check-env-files.mjs) accepts only references, empty values, and keys the file itself
 *   declares as plain config on a `# config: KEY KEY …` line. Anything else could be a secret.
 */

export const OP_REFERENCE_PREFIX = 'op://';

/**
 * Throws if any value in `env` is still a 1Password reference.
 *
 * @param {Record<string, string | undefined>} env usually `process.env`
 * @param {string} runCommand the command to suggest, e.g. `op run --env-file=.env -- npm run dev`
 */
export function assertNoOpReferences(env, runCommand) {
  const unresolved = Object.keys(env)
    .filter((key) => env[key]?.startsWith(OP_REFERENCE_PREFIX))
    .sort();
  if (unresolved.length > 0) {
    throw new Error(
      `Unresolved 1Password reference in ${unresolved.join(', ')}: the value is still op://…, ` +
        `so this was started without op run. Run it as: ${runCommand}`,
    );
  }
}

const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const CONFIG_DECLARATION = /^\s*#\s*config:(.*)$/;
const COMMENT_OR_BLANK = /^\s*(#.*)?$/;

/**
 * The value as dotenv reads it, or null when the text after `=` is not a clean value.
 * Quoted: the text between the quotes, and only a `# comment` may follow the closing quote.
 * Unquoted: the text before a whitespace-led `# comment`. A `#` with no whitespace before it is
 * kept, so `KEY=#abc` is checked as a value rather than waved through as a comment.
 */
function parseValue(raw) {
  const quoted = /^\s*(["'`])(.*?)\1(.*)$/.exec(raw);
  if (quoted) {
    return /^\s*(#.*)?$/.test(quoted[3]) ? quoted[2] : null;
  }
  return raw.replace(/\s#.*$/, '').trim();
}

/**
 * Lists every line of a committed env file that is not allowed to be there. Never returns or
 * echoes a value: each finding is a line number, the key (null for a line that is not KEY=value)
 * and a reason.
 *
 * @param {string} text the file's contents
 * @returns {{ line: number, key: string | null, reason: string }[]}
 */
export function findRawValues(text) {
  const lines = text.split(/\r?\n/);
  const declaredConfig = new Set(
    lines.flatMap((line) => {
      const declaration = CONFIG_DECLARATION.exec(line);
      return declaration ? declaration[1].split(/[\s,]+/).filter(Boolean) : [];
    }),
  );

  const findings = [];
  lines.forEach((line, index) => {
    const assignment = ASSIGNMENT.exec(line);
    if (!assignment) {
      if (!COMMENT_OR_BLANK.test(line)) {
        findings.push({ line: index + 1, key: null, reason: 'not a KEY=value line' });
      }
      return;
    }
    const [, key, raw] = assignment;
    if (declaredConfig.has(key)) {
      return;
    }
    const value = parseValue(raw);
    if (value !== null && (value === '' || value.startsWith(OP_REFERENCE_PREFIX))) {
      return;
    }
    findings.push({
      line: index + 1,
      key,
      reason: "raw value: neither an op:// reference nor declared on the file's `# config:` line",
    });
  });
  return findings;
}

/**
 * Whether the check gate inspects this tracked path: `.env`, `.env.<anything>`, `<name>.env`.
 * Examples included: a real secret pasted into `.env.example` is the classic leak.
 *
 * @param {string} path a repo-relative path, as `git ls-files` prints it
 */
export function isCheckedEnvFile(path) {
  const name = path.split('/').pop() ?? '';
  return name === '.env' || name.startsWith('.env.') || name.endsWith('.env');
}
