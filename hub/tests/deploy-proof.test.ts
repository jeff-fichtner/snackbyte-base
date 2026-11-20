// The deploy proof's offline parts: every value is a required flag, and the checks it runs against a
// deployed app pass a sound one and name what is wrong with an unsound one.
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { checkApp, parseFlags } from '../deploy-proof.mjs';

describe('the deploy proof flags', () => {
  it('reads --name=value flags', () => {
    expect(parseFlags(['--dir=/x', '--env=staging'], ['dir', 'env'])).toEqual({
      dir: '/x',
      env: 'staging',
    });
  });

  it('names every missing or empty required flag', () => {
    expect(() => parseFlags(['--dir='], ['dir', 'project'])).toThrow('missing --dir, --project');
  });

  it('refuses a flag it does not know, and a bare word', () => {
    expect(() => parseFlags(['--dir=/x', '--zone=a'], ['dir'])).toThrow('unknown flag --zone');
    expect(() => parseFlags(['dir'], ['dir'])).toThrow('not a --name=value flag');
  });
});

interface Fake {
  environment: string;
  number: string;
  robots: string | null;
  auth?: string;
}

describe('the deploy proof checks', () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  async function serve(fake: Fake): Promise<string> {
    server = createServer((req, res) => {
      if (fake.auth && req.headers.authorization !== fake.auth) {
        res.writeHead(403).end();
        return;
      }
      const headers: Record<string, string> = fake.robots ? { 'X-Robots-Tag': fake.robots } : {};
      if (req.url === '/api/health') {
        res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: 1, timestamp: 'now' }));
      } else if (req.url === '/api/version') {
        res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ number: fake.number, environment: fake.environment }));
      } else {
        res.writeHead(200, { ...headers, 'Content-Type': 'text/html' });
        res.end('<html><body><div id="root"><main>hi</main></div></body></html>');
      }
    });
    await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  }

  const staging = { env: 'staging', tag: 'v0.1.0-dev', noindex: true };

  it('passes a sound staging app, with or without the leading v', async () => {
    const url = await serve({ environment: 'staging', number: '0.1.0-dev', robots: 'noindex' });
    expect(await checkApp({ url, ...staging })).toEqual([]);
    server!.close();
    const url2 = await serve({ environment: 'staging', number: 'v0.1.0-dev', robots: 'noindex' });
    expect(await checkApp({ url: url2, ...staging })).toEqual([]);
  });

  it('sends the identity token it is given', async () => {
    const url = await serve({
      environment: 'staging',
      number: '0.1.0-dev',
      robots: 'noindex',
      auth: 'Bearer t',
    });
    expect(await checkApp({ url, ...staging, headers: { Authorization: 'Bearer t' } })).toEqual([]);
    expect((await checkApp({ url, ...staging })).length).toBeGreaterThan(0);
  });

  it('names a wrong environment and a missing noindex', async () => {
    const url = await serve({ environment: 'production', number: '0.1.0-dev', robots: null });
    const failures = await checkApp({ url, ...staging });
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain('/api/version reports v0.1.0-dev and staging');
    expect(failures[1]).toContain('noindex on for staging');
  });
});
