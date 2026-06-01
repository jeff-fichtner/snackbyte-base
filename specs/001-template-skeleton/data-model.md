# Phase 1 Data Model: snackbyte-base Template Skeleton

This feature is a template skeleton, not a data-backed application, so it has no
runtime persistence. The "entities" are the configuration and structural concepts
the template defines. They are drawn from the spec's Key Entities section.

## Entity: Deploy Mode

The single configuration value that determines build and serve behavior.

- **Field**: `DEPLOY_MODE`
- **Type**: enum — exactly two values: `static` | `server`
- **Source of truth**: one discoverable location (an environment variable read in
  `src/mode.ts`, defaulted/documented in `.env.example` and the README). One source
  only — no second place to set it (FR-002, Principle I).
- **Validation rules**:
  - MUST be exactly one of `static` | `server`; any other value is a hard error at
    startup/build.
  - Absent value MUST resolve to a single documented default (`server`, since most
    apps are server mode) — not an undefined/ambiguous state.
- **State transitions**: `static` ⇄ `server` by changing only the config value and
  deploy target. MUST NOT require application source rewrites (FR-005). The transition
  is config + deploy, never code.
- **Behavioral effect**:
  - `static` → build produces prerendered static assets; the container serves files
    and exposes NO API routes.
  - `server` → the container serves the built frontend AND mounts API routes.

## Entity: App Skeleton

The reusable file/folder structure, tooling configuration, and scripts every
spun-up app inherits.

- **Fields (constituents)**:
  - Tooling config: `tsconfig*.json`, `vite.config.ts`, Vitest config, ESLint +
    Prettier in `config/`.
  - Runtime pin: `.nvmrc`, `package.json` `engines.node` = Node 24 LTS.
  - Scripts: `dev`, `build`, `lint`, `format`, `typecheck`, `test`, plus an aggregate
    gate and a deploy script.
  - Deploy artifacts: `Dockerfile`, `.dockerignore`, `scripts/deploy.sh`,
    `cloudbuild.yaml`.
  - Source layout: `src/server.ts`, `src/mode.ts`, `src/web/` (React), `tests/`.
  - Docs: `README.md` (spin-up + mode choice), `.env.example`.
- **Validation rules (invariants)**:
  - MUST contain no application-specific business logic — skeleton only (FR-012,
    Principle III). Demonstrative content is allowed only to prove the skeleton works.
  - Lint, format, type-check, and test scripts MUST all pass on a fresh, unmodified
    copy (FR-007, FR-008, SC-004).
  - Build artifacts, dependencies, and local env files MUST be git-excluded (FR-011).
- **Relationships**: An App Skeleton is parameterized by exactly one Deploy Mode.
  Visual identity (theme, Header/Footer, shared components) is NOT part of the
  skeleton — it belongs to the future `@snackbyte/ui` package (Principle IV,
  out of scope here).
