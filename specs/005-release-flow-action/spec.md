# Feature Specification: Consume the Release-Flow GitHub Action

**Feature Branch**: `005-release-flow-action`

**Created**: 2026-07-06

**Status**: Draft

**Input**: The manifest-driven release flow (resolve-env + version derivation) was extracted into a
standalone GitHub Action, `snackbyte-release-flow-action`. Re-point this template to *consume* that
Action instead of carrying its own copy of the CI-side release logic — while keeping the app-side
manifest consumers exactly as they are.

## Context & Intent *(non-normative, read first)*

Spec 002 built version-derivation-from-tags and spec 003 generalized it into a declarative
N-environment manifest. Both landed the *logic* directly in this template: `scripts/derive-version.sh`
(and its test suite), the inline `resolve-env` node lookup in `.github/workflows/ci-cd.yml`, and the
`version-and-tag` job that runs the derivation. That logic has since been extracted, verbatim in
behavior, into a reusable GitHub Action — `snackbyte-release-flow-action`
(`jeff-fichtner/snackbyte-release-flow-action`, sibling repo). The Action is built and released: its
`@v1` tag is live on GitHub and resolves for a consuming `uses:` (verified 2026-07-06 — `v1` →
commit `1d897e7`, same tree as `v0.2.1`).

This feature makes the template **consume** the Action rather than duplicate its logic. It is a
**delete-and-delegate** refactor, not a new capability: the release behavior an app sees is
identical before and after. The value is single-sourcing — one implementation of the release flow,
maintained in one place, propagated by pinning a tag instead of hand-copying a script into every app.

Four design facts shape everything below; they were resolved deliberately and are not re-opened here:

1. **The manifest has two consumers, and only the CI-side one moves.** `environments.json` is read by
   two independent halves. The **CI-side release flow** — "is this pushed branch a deployable
   environment?" (resolve-env) and "what version tag does this push get?" (derive-version) — is what
   the Action owns and what this template deletes. The **app-runtime half** — the build-time identity
   bake (`scripts/resolve-env.mjs`), the typed server/frontend accessors (`src/environments.ts`,
   `src/env.ts`, `src/web/env.ts`), and the `/api/version` + version-chip surface
   (`src/routes/version.ts`, `src/version.ts`, `src/web/version.ts`), plus the `noindex` header — stays
   in this template untouched. The Action does not cover that half. A careless reading of "extract the
   env manifest" would wrongly delete these runtime readers; it must not.

2. **`environments.json` itself stays.** The Action *reads* the manifest (it consumes `branch` and
   `tagSuffix`); it does not own it. The file remains the single source of truth in this repo, in its
   current 5-facet shape (`name`, `branch`, `isPublicFace`, `noindex`, `tagSuffix`) — which is
   already exactly what both the Action and the app-runtime half expect. No manifest migration.

3. **The template pins to `@v1`.** Consuming `uses: jeff-fichtner/snackbyte-release-flow-action@v1`
   tracks fixes within the major automatically. `@v1` is live now, so no SHA-pinning workaround is
   needed. (An app that wants to lock a version may pin `@vX.Y.Z` or `@<sha>` instead; the template
   default is the moving `@v1`.)

4. **This template is a deployable-app archetype → `build-id` strategy (the Action's default).** The
   Action's `version-strategy` input defaults to `build-id` (global-monotonic, tree-reused PATCH),
   which is correct for a deployable app. The template omits the input (takes the default). A library
   spun up from this template must flip it to `version-strategy: package-json` — that guidance is
   documented, not enforced here.

The change is **template-only**, and is a deliberate improvement to the template itself (the
explicitly-allowed case per `CLAUDE.md`). Specs 002 and 003 are left untouched as the historical
record of the in-repo design this supersedes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A push to an environment branch still tags, via the Action (Priority: P1)

A push to a branch listed in `environments.json` (default `main` or `dev`) runs CI; when the quality
gate passes, the release-flow Action resolves the environment and derives+pushes the version tag —
exactly the tag the old in-repo script would have produced. A push to a non-environment branch
short-circuits with no tag and no failure.

**Why this priority**: This is the entire externally-observable contract of the feature. If the tag a
push produces changes (or stops being produced), the refactor has regressed the release flow. It is
the MVP: delegating the tag derivation while preserving its output is the whole feature.

**Independent test**: On a throwaway repo wired to the Action (or by reading the Action's own passing
test suite plus this template's workflow), push to `main` → observe `vMAJOR.MINOR.PATCH`; push to
`dev` → observe `…-dev`; push to a feature branch → observe `is-env=false`, no tag. Compare the
derived numbers to the documented derivation rules (reuse-on-same-tree, else global-max+1).

### User Story 2 — The template no longer carries the CI-side release logic (Priority: P1)

`scripts/derive-version.sh`, its test suite, and the `add-env` test are gone from the template; the
`ci-cd.yml` inline `resolve-env` node lookup and the hand-written `version-and-tag` derivation step
are replaced by a call to the Action. The `npm run test:release` gate (which tested the now-deleted
scripts) is removed from the workflow so CI does not reference deleted files.

**Why this priority**: Delegation without deletion is duplication — two copies of the release logic
that can drift. Removing the local copy is what makes the Action the single source of truth. Equal
priority to US1 because a half-done refactor (Action added, local logic left behind) is worse than
either endpoint.

**Independent test**: Grep the template for `derive-version.sh` / the inline resolve-env node lookup /
`test:release` → zero references outside historical specs. `ci-cd.yml` contains a `uses:
…snackbyte-release-flow-action@v1` step. `npm run check:all` (the remaining gate) passes.

### User Story 3 — The app-runtime manifest half is untouched (Priority: P1)

After the refactor, the build-time identity bake and the typed environment accessors behave exactly
as before: `/api/version` reports the same identity, `noindex` is emitted for the same environments,
the version chip shows/hides on the same rule, and `resolveBuildEnv()` still reads `environments.json`.

**Why this priority**: This is the guardrail that keeps the "delete the CI half" from becoming "delete
the manifest." It is P1 because a regression here silently corrupts every spun-up app's runtime
identity — a much worse failure than a broken tag, and one that would not show up in the release flow
at all.

**Independent test**: `scripts/resolve-env.mjs`, `src/environments.ts`, `src/env.ts`, `src/web/env.ts`,
the `/api/version` + version-chip surface (`src/routes/version.ts`, `src/version.ts`,
`src/web/version.ts`), and `environments.json` are unchanged by this feature (diff shows no edits to
them). The existing app-side behavior tests (build identity, `/api/version`) still pass.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The template's CI workflow (`.github/workflows/ci-cd.yml`) MUST call
  `jeff-fichtner/snackbyte-release-flow-action@v1` to perform environment resolution and version-tag
  derivation on an environment-branch push, in place of the current inline `resolve-env` node lookup
  and the hand-written `version-and-tag` derivation step.

- **FR-002**: The workflow MUST provide the Action the inputs its contract requires for correct
  operation: a full-history checkout (`fetch-depth: 0` — the derivation refuses a shallow clone),
  `permissions: contents: write` (to push the tag), and per-branch serialization
  (`concurrency: group: …-${{ github.ref }}`) so two pushes cannot race to a number. It MUST rely on
  the Action's input defaults (`branch`, `manifest`, `major-minor` from `package.json`) and MUST NOT
  set `version-strategy` (the template is a deployable app → the `build-id` default).

- **FR-003**: The push-side quality gate (`npm run check:all`) MUST remain and MUST gate the tag: the
  Action's tag-deriving step MUST run only after the gate passes and only when the branch resolves to
  an environment (`is-env == 'true'`).

- **FR-004**: The following files, superseded by the Action, MUST be deleted from the template:
  `scripts/derive-version.sh`, `scripts/derive-version.test.sh`, and `scripts/add-env.test.sh`.

- **FR-005**: The `npm run test:release` invocation MUST be removed from `ci-cd.yml` (both the merge
  gate and the push gate), and the `test:release` script — which runs only the now-deleted derivation
  tests — MUST be removed from or emptied in `package.json`. No remaining CI step may reference a
  deleted file. (The app quality gate `check:all` is unaffected.)

- **FR-006**: `environments.json` MUST remain in the repo, unchanged, retaining its current facets
  (`name`, `branch`, `isPublicFace`, `noindex`, `tagSuffix`). It is the manifest the Action reads and
  the app-runtime half reads; nothing in this feature edits it.

- **FR-007**: The app-runtime manifest consumers MUST be left functionally unchanged by this feature:
  `scripts/resolve-env.mjs` (build-time identity bake), the typed accessors (`src/environments.ts`,
  `src/env.ts`, `src/web/env.ts`), and the `/api/version` + version-chip surface
  (`src/routes/version.ts`, `src/version.ts`, `src/web/version.ts`), together with the `noindex`
  header. This feature does not touch the app-runtime half.

- **FR-008**: Documentation that describes the release flow as in-repo scripts (notably `DEPLOY.md`,
  the `ci-cd.yml` header comments, and any spec-referencing prose in `CLAUDE.md`) MUST be updated to
  describe consuming the Action, including the app-vs-library `version-strategy` note (deployable app
  = `build-id` default; a spun-up library flips to `package-json`). The Action's own `CONSUMING.md`
  is the authoritative wiring reference and SHOULD be linked rather than duplicated.

- **FR-009**: The template MUST pin the Action by the moving `@v1` tag (auto-updates within the
  major). This is the template default; an individual app MAY re-pin to `@vX.Y.Z` or `@<sha>` to lock
  a version, and the docs SHOULD say so.

### Non-Functional / Invariants

- **I1 — Behavior parity**: The version tag produced for any given push MUST be identical to what the
  pre-refactor in-repo derivation would have produced (same reuse-on-same-tree and global-max+1
  rules, same suffix stamping). This refactor changes *where* the logic runs, never *what number* it
  produces.

- **I2 — No app-source churn**: The diff MUST touch only CI/release/tooling/doc files and the deleted
  scripts. It MUST NOT modify application source (`src/**` app code) or the app-runtime manifest
  readers (I3 below). A diff that edits those is out of scope and a signal the CI/app split was
  crossed.

- **I3 — The split is load-bearing**: `scripts/resolve-env.mjs`, `src/environments.ts`, `src/env.ts`,
  `src/web/env.ts`, the `/api/version` + version-chip surface (`src/routes/version.ts`,
  `src/version.ts`, `src/web/version.ts`), and `environments.json` are explicitly out of deletion
  scope. Only the CI-side release flow (FR-004/FR-005) is removed. *Exception:* comment-only edits to
  these files (e.g. a doc-comment that pointed at the now-deleted `scripts/derive-version.sh`, updated
  to point at the Action) are permitted — they are not functional changes and keep the files honest.

## Success Criteria *(mandatory)*

- **SC-001**: A push to an environment branch produces the same version tag it would have produced
  before this feature (verified against the derivation rules / the Action's test suite). [US1, I1]

- **SC-002**: A push to a non-environment branch produces no tag and does not fail the workflow. [US1]

- **SC-003**: `ci-cd.yml` contains a `uses: jeff-fichtner/snackbyte-release-flow-action@v1` step with
  `fetch-depth: 0`, `contents: write`, and a per-branch `concurrency` group; it contains no inline
  resolve-env node lookup and no hand-written derivation step. [US2, FR-001/FR-002]

- **SC-004**: The template contains no `scripts/derive-version.sh`, `scripts/derive-version.test.sh`,
  or `scripts/add-env.test.sh`, and no CI step references `test:release` or any deleted file;
  `npm run check:all` passes. [US2, FR-004/FR-005]

- **SC-005**: `environments.json` and the app-runtime manifest readers are byte-unchanged by this
  feature's diff, and the existing app-side identity behavior (build bake, `/api/version`, noindex,
  version chip) is unaffected. [US3, FR-006/FR-007, I2/I3]

- **SC-006**: `DEPLOY.md` and the `ci-cd.yml` header describe consuming the Action (with the
  app-vs-library `version-strategy` note) rather than the deleted in-repo scripts, and link the
  Action's `CONSUMING.md`. [FR-008]

## Out of Scope

- **Changing release behavior.** Any change to the derivation math, the suffix scheme, or what counts
  as an environment. This feature is a pure relocation of unchanged logic.
- **The app-runtime manifest half.** No edits to the build-time identity bake or the typed accessors.
- **Cutting or versioning the Action.** The Action is already built and `@v1` is live; its own
  Marketplace listing and moving-tag maintenance are the Action repo's features, not this one.
- **Migrating already-spun-up apps.** How existing apps adopt the Action (re-copy vs. re-spin) is a
  propagation concern, tracked with the template's general upgrade discipline — not this spec.

## Assumptions

- The Action's `@v1` is and remains live and behavior-equivalent to the deleted in-repo scripts
  (confirmed 2026-07-06). If the Action's contract changes, that is the Action repo's concern; this
  template pins `@v1` and inherits fixes within the major.
- `package.json` continues to carry `MAJOR.MINOR` as its `version` (the Action reads it for the
  version line under `build-id`); the patch stays CI-derived. (The active `version` is `1.5`.)
