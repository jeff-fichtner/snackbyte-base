<!--
SYNC IMPACT REPORT
==================
Version change: (template, unversioned) → 1.0.0
Bump rationale: Initial ratification — first concrete constitution replacing the
  unpopulated Spec Kit template. MAJOR baseline (1.0.0).

Modified principles: N/A (initial adoption; all placeholders replaced)
Added principles:
  - I.   Single Template, Mode Switch
  - II.  Convention Over Configuration
  - III. Skeleton Only — No Application Logic
  - IV.  Two-Tier Propagation (Template vs Package)
  - V.   Uniform Deploy Path (Cloud Run Default)
  - VI.  Prerender By Default
  - VII. Pinned, Linted, Type-Safe, Tested
Added sections:
  - Technology Stack (replaces [SECTION_2_NAME])
  - Development Workflow & Quality Gates (replaces [SECTION_3_NAME])
Removed sections: none

Templates requiring review for alignment:
  - .specify/templates/plan-template.md   ✅ reviewed — Constitution Check gate generic, compatible
  - .specify/templates/spec-template.md   ✅ reviewed — no mandatory-section conflicts
  - .specify/templates/tasks-template.md  ✅ reviewed — task categories accommodate testing/lint/deploy gates
  - .specify/templates/checklist-template.md ✅ reviewed — no constitution-specific coupling

Follow-up TODOs: none. RATIFICATION_DATE set to first adoption (2026-05-31).
-->

# snackbyte-base Constitution

snackbyte-base is the reusable technical skeleton for the snackbyte.io family of
one-off applications. Each app is spun up from this template (GitHub "Use this
template"), then deployed independently to its own subdomain. This constitution
governs what the template guarantees to every app spun up from it. It supersedes
ad-hoc convention; spec, plan, and task artifacts MUST conform to it.

## Core Principles

### I. Single Template, Mode Switch

There is exactly ONE template skeleton, not a family of forks. Each app declares a
deploy mode at spin-up with exactly two values: `static` or `server`, recorded in a
single discoverable configuration location. Both modes MUST work from one unmodified
skeleton. Switching modes MUST NOT require rewriting application source code — only
the mode configuration and deploy target change.

**Rationale**: Two templates double the maintenance surface for a solo maintainer
and let the two paths drift. A single template with a small, config-level fork keeps
every app on the same proven base; a static app that later grows a backend is a
config change, not a rewrite.

### II. Convention Over Configuration

Spin-up MUST require no re-deciding of tooling, structure, or conventions. A fresh
copy MUST yield a running dev server and a buildable app via documented commands, in
under five minutes, with zero additional configuration decisions. Linting,
formatting, type-checking, and testing MUST already be configured and runnable.

**Rationale**: The entire purpose of the template is fast, uniform spin-up. If the
developer must re-decide tooling each time, the template has failed and the apps
diverge.

### III. Skeleton Only — No Application Logic

The template MUST NOT contain application-specific business logic. It ships
structure, tooling, configuration, scripts, and deploy artifacts — nothing that
belongs to one app's domain. Demonstrative placeholder content is allowed only where
it proves the skeleton works (e.g. a rendered page proving prerender), never as
domain logic.

**Rationale**: Business logic in the skeleton would be copied into every app whether
relevant or not, and would have to be deleted on every spin-up — the opposite of a
clean starting point.

### IV. Two-Tier Propagation (Template vs Package)

Change propagation has exactly two tiers, and each kind of change uses the correct
one. Skeleton concerns — toolchain, configs, folder conventions, the mode switch,
deploy artifacts — live in this template and propagate by manual backport (rare,
accepted, because the skeleton stabilizes). Shared visual identity — theme, Header/
Footer, shared components — does NOT live here; it belongs to the future
`@snackbyte/ui` versioned npm package and propagates by version bump.

**Rationale**: GitHub templates are a one-time copy, bad at keeping
frequently-changing styling in sync across subdomains; a versioned package is built
for exactly that. The skeleton stabilizes, so a one-time copy is fine for it.

### V. Uniform Deploy Path (Cloud Run Default)

Both deploy modes target Google Cloud Run by default. A static-mode app is a
container that serves built files and exposes no API routes; a server-mode app is the
same container plus API routes. The template MUST ship the artifacts for this single
path: a `Dockerfile`, a `.dockerignore`, and a documented deploy path (`gcloud run
deploy` and/or a Cloud Build config). Cloud Storage + Cloud CDN is a documented
performance-only opt-in for static apps (instant response, global edge) — never the
default and never chosen on cost grounds.

**Rationale**: One deploy path for every app maximizes uniformity for a solo
maintainer and gives a static app a free promotion to server mode. Cost is a tie at
~$0 (scale-to-zero, per-request-ms billing), so cost cannot decide the default;
uniformity does.

### VI. Prerender By Default

Static, build-time-known content MUST be prerendered to real HTML at build time, not
shipped as an empty shell rendered in the browser. Client-side rendering MUST remain
available for genuinely runtime-driven apps (games, interactive tools), but is the
exception, not the default.

**Rationale**: CSR-ing static content wastes first paint and SEO for content that
never changes. The anti-pattern is client-rendering static content — not using React,
which prerenders cleanly at this scale.

### VII. Pinned, Linted, Type-Safe, Tested

Every app MUST agree on its runtime and quality gates. The template MUST pin Node 22
LTS, use TypeScript throughout, and ship runnable ESLint + Prettier and Vitest
configurations. Lint, format, type-check, and test scripts MUST all run successfully
on a fresh, unmodified copy. The repository MUST exclude build artifacts,
dependencies, and local environment files from version control.

**Rationale**: A pinned runtime and pre-wired quality gates are what make every
spun-up app behave the same in development and production, and what stop quality from
being re-litigated per app.

## Technology Stack

The skeleton's stack is fixed (deviation requires a constitution amendment):

- **Language**: TypeScript (non-negotiable).
- **Build/dev server**: Vite.
- **UI framework**: React (chosen because the shared `@snackbyte/ui` layer is a
  component-library problem best-trodden in React; React does not force server mode).
- **Backend**: Express, present in the skeleton, deployed only in `server` mode.
- **Tests**: Vitest (reuses `vite.config`, ESM-native).
- **Runtime**: Node 22 LTS, pinned.
- **Lint/format**: ESLint (typescript-eslint) + Prettier.
- **Host**: Google Cloud Platform — Cloud Run (default deploy path for both modes),
  Artifact Registry for images.

Conventions are adapted from the existing `tonic` app, with Jest replaced by Vitest
and React adopted as the UI layer. `tonic` proved the toolchain; it did NOT prove the
static/server mode switch, the stripped skeleton, or the shared-UI layer — those are
the new, unproven work this template establishes.

## Development Workflow & Quality Gates

- **Spec-driven development**: features follow the Spec Kit flow —
  `/speckit-constitution` → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks`
  → `/speckit-implement`. Specs live at `specs/NNN-short-name/spec.md`, one git
  branch per feature.
- **Constitution gate**: every plan MUST pass a Constitution Check; any violation of
  a principle MUST be justified in writing or the design changed. Unjustified
  complexity is rejected.
- **Quality gate**: lint, format, type-check, and Vitest MUST pass on a fresh copy
  before the skeleton is considered green. These are the same gates every spun-up app
  inherits.
- **Durable decision record**: architecture decisions that outlive a single session
  are captured in `docs/DECISIONS.md`; spec-level detail lives in the feature spec.

## Governance

This constitution supersedes other practices for snackbyte-base. When guidance
conflicts, the constitution wins.

- **Amendments** require an explicit edit to this file with a Sync Impact Report and
  a version bump, plus propagation to any dependent templates and docs in the same
  change.
- **Versioning policy** (semantic):
  - **MAJOR** — backward-incompatible governance changes or principle removals/
    redefinitions.
  - **MINOR** — a new principle or section, or materially expanded guidance.
  - **PATCH** — clarifications, wording, and non-semantic refinements.
- **Compliance review**: plans and specs are checked against these principles before
  implementation; reviews verify that changes either comply or carry a written
  justification. The stack in Technology Stack is fixed — changing it is an amendment,
  not a per-app decision.

**Version**: 1.0.0 | **Ratified**: 2026-05-31 | **Last Amended**: 2026-05-31
