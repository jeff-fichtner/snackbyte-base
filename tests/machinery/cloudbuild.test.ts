// @vitest-environment node
//
// Locks the deploy contract that keeps a Cloud Run service off the project's default compute
// service account — a single identity every app in a project shares, which is how one app ends
// up able to read another's data.
//
//   - cloudbuild.yaml declares _RUN_SA with NO usable default, guards it, and passes it to
//     `gcloud run deploy --service-account`. A future edit that drops any of the three would
//     silently restore the shared-identity deploy, so each is asserted separately.
//   - --ingress stays, so a service never comes up reachable on *.run.app.
//   - there is exactly ONE deploy path: no scripts/deploy.sh (a `gcloud run deploy --source .`
//     wrapper set neither flag, and it is deleted rather than fixed).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const cloudbuild = readFileSync(join(repoRoot, 'cloudbuild.yaml'), 'utf8');

describe('cloudbuild.yaml requires a runtime service account', () => {
  it('declares _RUN_SA with an empty default (so an omitted value is caught, not inherited)', () => {
    expect(cloudbuild).toMatch(/^\s*_RUN_SA:\s*''\s*$/m);
  });

  it('fails the deploy step when _RUN_SA is empty', () => {
    // Match the whole block up to its closing `fi` on its own line — searching for the
    // substring 'fi' would stop early on any word containing it ("configure", "verify").
    const guard = cloudbuild.match(/if \[ -z "\$\{_RUN_SA\}" \]; then\n([\s\S]*?)\n\s*fi$/m);
    expect(guard).not.toBeNull();
    // The guard must actually stop the build, not just warn.
    expect(guard![1]).toContain('exit 1');
  });

  it('passes the runtime identity to gcloud run deploy', () => {
    expect(cloudbuild).toContain('--service-account=${_RUN_SA}');
  });

  it('locks ingress to the load balancer', () => {
    expect(cloudbuild).toContain('--ingress=internal-and-cloud-load-balancing');
  });
});

describe('one deploy path', () => {
  it('ships no manual deploy script', () => {
    expect(existsSync(join(repoRoot, 'scripts/deploy.sh'))).toBe(false);
  });
});
