# Phase 0 Research: snackbyte-base Template Skeleton

All technical choices for this feature were settled during the planning sessions
recorded in `docs/DECISIONS.md` and ratified by the constitution. No NEEDS
CLARIFICATION items remained from Technical Context. This file consolidates each
decision in the required format so the plan is self-contained.

## R1. Single template with a mode switch (not two templates)

- **Decision**: One skeleton; the deploy mode is a single config value (`DEPLOY_MODE`
  ∈ {`static`, `server`}) recorded in one discoverable location.
- **Rationale**: Two templates double maintenance for a solo maintainer and drift
  apart. A static app that later needs a backend must promote without a rewrite
  (FR-005). Mandated by Constitution Principle I.
- **Alternatives considered**: Two separate templates (rejected — drift, double
  upkeep); a monorepo of per-mode packages (rejected — reintroduces the fork).

## R2. UI framework: React

- **Decision**: React + ReactDOM.
- **Rationale**: The later `@snackbyte/ui` shared layer is a component-library
  problem, best-trodden in React; most apps are interactive (server mode), where a
  component model pays off. React does not force server mode — it prerenders cleanly.
- **Alternatives considered**: Vanilla/no framework (rejected — no path to a shared
  component package); Svelte/Vue (rejected — smaller component-library ecosystem for
  the shared layer). The "React too heavy for static" concern was examined and
  dismissed: ~45KB gzipped, invisible at this scale, and prerender removes the
  blank-shell cost.

## R3. Test runner: Vitest

- **Decision**: Vitest.
- **Rationale**: Reuses `vite.config`, ESM-native, faster than Jest; one config for
  build and test. Replaces tonic's Jest + ts-jest + jsdom stack.
- **Alternatives considered**: Jest (rejected — extra ts-jest/jsdom config, slower,
  no vite.config reuse), as proven painful in tonic.

## R4. Runtime: Node 22 LTS, pinned

- **Decision**: Node 22 LTS, pinned via `.nvmrc` and `package.json` `engines`.
- **Rationale**: Every spun-up app must agree on the runtime (FR-009). tonic ran on
  non-LTS v23; pin to LTS for production stability. Mandated by Principle VII.
- **Alternatives considered**: Unpinned/latest (rejected — apps drift across Node
  versions); non-LTS (rejected — shorter support window).

## R5. Hosting: Cloud Run as the single default deploy path

- **Decision**: Both modes deploy to Google Cloud Run via one path; the skeleton
  ships a `Dockerfile`, `.dockerignore`, and a deploy script/Cloud Build config. A
  static app is a container that serves files with no API routes.
- **Rationale**: One deploy path maximizes uniformity for a solo maintainer; a static
  app promotes to server for free (already on Cloud Run). Cost is a tie at ~$0
  (scale-to-zero, per-request-ms billing), so it cannot decide the default —
  uniformity does. GCP chosen over Azure for Google ecosystem gravity. Mandated by
  Principle V.
- **Alternatives considered**: Cloud Storage + Cloud CDN as the static default
  (rejected as default — separate deploy path, no free promotion; retained as a
  documented performance-only opt-in for high-traffic/global static apps); Azure
  Container Apps (rejected — no Microsoft enterprise gravity here); Kubernetes/GKE
  (rejected — wrong ops appetite; managed PaaS wanted).

## R6. Render strategy: prerender static content by default

- **Decision**: Build-time-known content is prerendered to HTML; CSR remains
  available for runtime-driven apps (games, tools).
- **Rationale**: CSR-ing static content wastes first paint and SEO. Render strategy
  and deploy mode are independent knobs that compose freely. Mandated by Principle VI
  and FR-006.
- **Alternatives considered**: CSR-only (rejected — blank-shell first paint, poor
  SEO for static content); SSR-by-default (rejected — forces server mode, over-scoped
  for v1; remains available per-app).

## R7. Lint/format and conventions baseline

- **Decision**: ESLint (typescript-eslint) + Prettier, with a `config/` folder for
  tooling configs and a `check:all`-style aggregate gate — a stripped subset of
  tonic's conventions.
- **Rationale**: tonic proved this toolchain; reuse the proven parts, drop the
  app-specific weight (migrations, Google APIs, documentation pipeline) to honor
  "skeleton only" (Principle III, FR-012). Mandated by Principle VII.
- **Alternatives considered**: Biome / other all-in-one linters (rejected — tonic's
  ESLint+Prettier setup is already proven and transferable); copying tonic wholesale
  (rejected — carries business logic the skeleton must not contain).
