# Contract: Deploy Mode + Skeleton Scripts

This template is consumed by developers, not called over a network. Its "interface"
is therefore (a) the `DEPLOY_MODE` configuration contract and (b) the behavior
contract of the documented scripts. Each clause below is independently testable and
maps to a spec requirement / success criterion.

## C1. DEPLOY_MODE configuration

| Aspect | Contract |
|---|---|
| Name | `DEPLOY_MODE` |
| Values | exactly `static` or `server` |
| Default | `server` (documented) when unset |
| Source | single discoverable location (env, read in `src/mode.ts`) |
| Invalid value | hard error at build/startup with a clear message — never silent fallback |

**Maps to**: FR-002, Principle I. **Tested by**: `tests/unit/mode.test.ts`.

## C2. `static` mode build

- **Given** `DEPLOY_MODE=static`, **when** `npm run build` runs, **then** the output
  is a set of static assets deployable with no running server required, and
  build-time-known content is present as rendered HTML (not an empty root element).
- The container built from these assets serves files and exposes **no** API routes.

**Maps to**: FR-003, FR-006, SC-003. **Tested by**: build-output inspection in
`tests/integration/server.test.ts` (HTML contains rendered markup) and a no-API-route
assertion.

## C3. `server` mode build + start

- **Given** `DEPLOY_MODE=server`, **when** the app is built and started, **then** an
  Express server serves the built frontend **and** can expose API routes (the sample
  `health` route responds).

**Maps to**: FR-004. **Tested by**: `tests/integration/server.test.ts` (frontend
served + health route 200 in server mode; health route absent in static mode).

## C4. Mode switch without source rewrite

- **Given** either mode, **when** `DEPLOY_MODE` is changed, **then** build/start
  behavior changes accordingly with no edits to application source — only the config
  value and deploy target change.

**Maps to**: FR-005, SC-002, Principle I.

## C5. Quality-gate scripts

- **Given** a fresh, unmodified copy, **when** each of `npm run lint`, `npm run
  format` (check), `npm run typecheck`, and `npm test` runs, **then** each completes
  successfully with zero additional configuration.

**Maps to**: FR-007, FR-008, SC-004, Principle VII.

## C6. Cloud Run deploy artifacts

- The repo MUST contain a `Dockerfile`, a `.dockerignore`, and a documented deploy
  path (`scripts/deploy.sh` / `gcloud run deploy` and/or `cloudbuild.yaml`). Both
  modes use this one Cloud Run path; the mode difference is only whether API routes
  are exposed. A Cloud Storage + CDN path MUST be documented as a performance-only
  opt-in, not the default.

**Maps to**: FR-003, FR-003a, FR-004, FR-004a, Principle V. **Tested by**: presence/
review check (artifacts exist; README documents both the default and the opt-in).

## C7. Spin-up time + skeleton purity

- A developer goes from "Use this template" to a running dev server in under 5
  minutes via documented steps only (SC-001).
- The template contains no application-specific business logic (SC-005, FR-012) —
  verifiable by review; only demonstrative content that proves the skeleton.

**Maps to**: SC-001, SC-005, FR-010, FR-012, Principles II & III.
