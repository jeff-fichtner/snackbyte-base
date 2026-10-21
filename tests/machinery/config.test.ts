// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPort } from '../../src/config.js';

const configModule = fileURLToPath(new URL('../../src/config.ts', import.meta.url));

describe('readPort', () => {
  it('is 8080 when PORT is unset', () => {
    expect(readPort(undefined)).toBe(8080);
  });

  it('uses a set PORT', () => {
    expect(readPort('3000')).toBe(3000);
    expect(readPort('8080')).toBe(8080);
  });

  it.each(['', '   ', 'abc', '0', '65536', '-1', '80.5'])('rejects PORT=%j, naming PORT', (raw) => {
    expect(() => readPort(raw)).toThrow(/^PORT must be a whole number from 1 to 65535/);
  });
});

describe('PORT at module load', () => {
  // The constant is computed when the module loads, so a bad value stops the process that
  // imports it before anything listens. Proven in a real Node process, the way the server and
  // vite.config.ts load it.
  function load(port: string | undefined) {
    const env = { ...process.env };
    if (port === undefined) {
      delete env.PORT;
    } else {
      env.PORT = port;
    }
    return spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(configModule)}); console.log(m.PORT);`,
      ],
      { env, encoding: 'utf8' },
    );
  }

  it('loads as 8080 with PORT unset', () => {
    const run = load(undefined);
    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe('8080');
  });

  it('fails loudly with a blank PORT', () => {
    const run = load('');
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/PORT must be a whole number from 1 to 65535, got ""/);
  });
});
