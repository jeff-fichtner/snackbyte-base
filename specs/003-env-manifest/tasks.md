---
description: "Task list for Declarative N-Environment Manifest"
---

# Tasks: Declarative N-Environment Manifest

**Input**: Design documents from `specs/003-env-manifest/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (versioning.md, env-identity.md), quickstart.md

**Tests**: INCLUDED. The feature is release/build tooling whose correctness is git/CI behavior and
runtime invariants; the spec requires the behavior-complete derivation matrix (FR-024) and runtime
Vitest coverage (SC-008). Tests are first-class here, not optional.

**Organization**: Tasks are grouped by user story. The Foundational phase is large for this feature —
the manifest + the de-hardcoded consumers must exist before US1 (the byte-identical default) can even
be verified. US1 is therefore primarily a verification/equivalence gate over the foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4); Setup/Foundational/Polish carry no label
- Paths are repo-root-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The manifest itself and the shared reader every other consumer depends on.

- [ ] T001 Create `environments.json` at repo root with the default two entries — `production` (branch `main`, isPublicFace true, noindex false, tagSuffix "") and `staging` (branch `dev`, isPublicFace false, noindex true, tagSuffix "-dev") — per data-model.md. App-agnostic; no app name or deploy coordinates. State its purpose in a top-of-file comment without any spec citation.
- [ ] T002 Create `src/environments.ts` — the typed manifest reader: load and type `environments.json`, expose `getEnvironments()`, `findByBranch(branch)`, `findByName(name)`, and the exported `LOCAL` constant `{ name: 'local', isPublicFace: false, noindex: true }`. Pure, no side effects; usable by both the server build output and Node tooling.
- [ ] T003 [P] Decide and document (in a code comment in `src/environments.ts`) the tag-format parts (`prefix = 'v'`, suffix-per-env), so the parser-from-parts rule (contracts/versioning.md) has one source.

**Checkpoint**: The manifest exists and is readable by Node; nothing consumes it yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: De-hardcode every consumer to read the manifest, and bake build-time identity. This is the
core of the feature and BLOCKS verification of all user stories.

**⚠️ CRITICAL**: No user story can be verified until this phase is complete.

### Versioning derivation (suffix-agnostic, manifest-driven)

- [ ] T004 Rewrite the reuse step in `scripts/derive-version.sh` to be SUFFIX-AGNOSTIC: match any `v<MM>.<patch>` with any suffix or none on HEAD (contracts/versioning.md rule step 2). Remove the per-branch sibling regex `if/else`.
- [ ] T005 In `scripts/derive-version.sh`, resolve the pushing branch's `tagSuffix` and branch-validity from `environments.json` via `node -p` (the existing package.json-reading pattern). An unknown branch → hard error (FR-009). No `if branch == X` code path remains (FR-008).
- [ ] T006 In `scripts/derive-version.sh`, emit a non-blocking warning when two manifest entries share a `tagSuffix` (FR-005a / invariant I3). Keep the existing collision guard (I-collision) and shallow-checkout refusal (I5) intact.
- [ ] T007 Verify `scripts/derive-version.sh` keeps the global-max mint, the no-overwrite collision guard, and the tag-only push (no commit) — confirm the parser used for read-back is generated from the format parts (T003), not hand-written separately (FR-012).

### Build-time identity (bake from a single name build-arg)

- [ ] T008 Add `ARG APP_ENV_NAME` to `Dockerfile` (single env name build-arg) and thread it into the build `RUN` step alongside the existing build-args; keep `APP_IS_PUBLIC_FACE` (now derivable from the resolved facets).
- [ ] T009 In `vite.config.ts`, resolve the env facets from `environments.json` by `APP_ENV_NAME` at build time, and bake the identity: add a `__APP_ENV_NAME__` define (and keep `__IS_PUBLIC_FACE__`, now sourced from the resolved facet). Read the name from env, fall back to `local` when unset.
- [ ] T010 In `scripts/prerender.mjs`, mirror `vite.config.ts` exactly: resolve the same facets by `APP_ENV_NAME` and set the matching globals (`__APP_ENV_NAME__`, `__IS_PUBLIC_FACE__`) before importing the app, so prerender and hydration agree. The inline `local` literal MUST mirror `src/environments.ts`'s `LOCAL`.
- [ ] T010a In `scripts/build.mjs`, add a build step that resolves `APP_ENV_NAME` against `environments.json` and writes `src/env.generated.ts` (`export const BAKED = { name, isPublicFace, noindex } as const;`) BEFORE the `tsc` server compile, so the server bakes its identity as a build-time constant (env-identity contract "Server-side bake mechanism"). Add `src/env.generated.ts` to `.gitignore`.
- [ ] T011 In `cloudbuild.yaml`, add `_APP_ENV_NAME` substitution and pass it as the `APP_ENV_NAME` build-arg; pass the resolved `_APP_IS_PUBLIC_FACE` as today. Set runtime env to carry the same name as a pass-through (not a source of truth). Keep prod defaults byte-identical.

### Runtime consumers read the baked identity

- [ ] T012 In `src/version.ts`, report `environment` from the BAKED identity (`BAKED.name` from `src/env.generated.ts`), not runtime `APP_ENV`. Fall back to `LOCAL` (from `src/environments.ts`) when the generated module is absent (local dev). `APP_ENV` is at most a pass-through (FR-014, FR-017).
- [ ] T013 In `src/server.ts`, change the noindex middleware to emit `X-Robots-Tag: noindex` based on the ACTIVE env's `noindex` facet (`BAKED.noindex`, else `LOCAL.noindex`), not `APP_ENV === 'staging'` (FR-015). Keep it OUTSIDE the SPINUP:server-only markers.

### CI trigger (wildcard + resolve-env)

- [ ] T014 In `.github/workflows/ci-cd.yml.disabled`, change the push trigger to a wildcard with `branches-ignore` for obvious noise (`feature/**`, `dependabot/**`, …) (FR-020). Leave the `pull_request` merge gate unchanged.
- [ ] T015 In `.github/workflows/ci-cd.yml.disabled`, add a lightweight `resolve-env` first job: shallow checkout, read `environments.json`, look up `GITHUB_REF_NAME`; output whether it is an environment branch. Gate `version-and-tag` (and any deploy) via `needs: resolve-env` + `if:` so a non-environment push short-circuits before `npm ci`/build (FR-021).
- [ ] T016 Update the `init.mjs` workflow-rewrite header text to describe the manifest model (branch→environment via `environments.json`), WITHOUT touching `environments.json` itself (FR-003) and without any spec citation.

**Checkpoint**: Every consumer reads the manifest; identity is baked; the default manifest reproduces
today's wiring. User-story verification can now begin.

---

## Phase 3: User Story 1 — Default is byte-identical (Priority: P1) 🎯 MVP

**Goal**: Prove an app that does not edit the manifest behaves byte-identically to the pre-feature template.

**Independent Test**: With the default manifest, the derivation matrix passes, and the production +
staging builds match the equivalence table in contracts/env-identity.md (chip, noindex, reported env).

### Tests for User Story 1

- [ ] T017 [P] [US1] Rewrite `scripts/derive-version.test.sh` to the BEHAVIOR-COMPLETE matrix in contracts/versioning.md: scenarios B1–B13 using stand-in environments (not the literal main/dev enumeration). Include B6 (three envs on one commit share a number) and B11 (unknown branch → hard error). The scenario count MUST NOT scale with environment count (FR-024).
- [ ] T018 [P] [US1] Update `tests/machinery/chip.test.ts` if needed so the chip assertion is driven by the resolved `isPublicFace` facet path (build-keyed), confirming production hides / staging shows — unchanged behavior, new source.
- [ ] T019 [P] [US1] Add a Vitest test asserting `src/server.ts` emits `X-Robots-Tag: noindex` for a baked staging identity and NOT for a baked production identity (the facet-driven path).
- [ ] T020 [P] [US1] Add a Vitest test asserting `/api/version` reports the baked `environment` (production vs staging) from the baked identity.

### Implementation / verification for User Story 1

- [ ] T021 [US1] Run `npm run check:all` and `npm run test:release`; fix any regression so both are green with the default manifest (SC-008).
- [ ] T022 [US1] Build the production-default and staging-style images; verify the contracts/env-identity.md equivalence table (production byte-identical; staging chip+noindex+label). Record the check in quickstart V1 terms.

**Checkpoint**: The default path is proven unchanged. MVP complete — the feature is safe to ship even if no app ever adds an environment.

---

## Phase 4: User Story 2 — Add an Nth environment via one manifest row (Priority: P2)

**Goal**: Prove adding an environment touches only the manifest, and the derivation handles N envs.

**Independent Test**: Add a `qa` row + push a `qa` branch in a fixture; a `-qa` tag derives, the `qa`
image reports `qa`/noindex/chip, and `git diff` shows only `environments.json` changed (reusable half).

### Tests for User Story 2

- [ ] T023 [P] [US2] Confirm the behavior-complete matrix (T017) already covers the N-env behaviors for US2 — B3 (advance over mixed suffixes), B4/B5 (reuse both directions), B6 (three envs share a number), B13 (single-env self-increment). Add a scenario only if a behavior is uncovered; do NOT add a per-environment row (FR-024).
- [ ] T024 [P] [US2] Add a guard asserting that adding a third environment changed ONLY `environments.json` in the reusable half (SC-002): in the T025 fixture, after the env-addition commit, assert `git diff --name-only` for that commit lists only `environments.json` (the new branch aside) — i.e. `scripts/derive-version.sh`, `.github/workflows/ci-cd.yml*`, `src/server.ts`, `vite.config.ts`, `scripts/prerender.mjs`, and `scripts/build.mjs` are untouched by the env addition. (Shares the T025 fixture; this is the diff assertion, T025 is the behavioral verification.)

### Implementation / verification for User Story 2

- [ ] T025 [US2] In a throwaway fixture, add a `qa` row (branch `qa`, isPublicFace false, noindex true, tagSuffix `-qa`), push `qa`, and verify: derives `v<MM>.<patch>-qa`; `resolve-env` recognizes `qa`; a build with `APP_ENV_NAME=qa` reports `qa`, serves noindex, shows the chip (quickstart V2/V3).
- [ ] T026 [US2] Verify a push to a branch NOT in the manifest short-circuits cleanly (no tag, no deploy, no failure) via `resolve-env` (quickstart V5 / SC-005).

**Checkpoint**: A third environment works with a one-file edit; non-env branches no-op cleanly.

---

## Phase 5: User Story 3 — Typed `env` accessor for app code (Priority: P3)

**Goal**: App code branches on the current environment via a typed accessor, consistent server/frontend, with a `local` fallback.

**Independent Test**: For a known build, the accessor reports the same env on server and frontend; local dev reports `local`; a rolled-back image reports its built env.

### Tests for User Story 3

- [ ] T027 [P] [US3] Add a Vitest test for the frontend accessor (`src/web/env.ts`): with a baked `__APP_ENV_NAME__`, `env.name`/`env.isPublicFace`/`env.is()` report it; with nothing baked, they report `local`.
- [ ] T028 [P] [US3] Add a Vitest test for the server accessor (`src/env.ts`): same assertions from the baked server-side identity, including the `local` fallback.

### Implementation for User Story 3

- [ ] T029 [P] [US3] Create `src/env.ts` — the server `env` accessor (`name`, `isPublicFace`, `is(name)`) reading `BAKED` from `src/env.generated.ts`, falling back to `LOCAL` from `src/environments.ts` when the generated module is absent (FR-018, FR-019).
- [ ] T030 [P] [US3] Create `src/web/env.ts` — the frontend `env` accessor reading the inlined `__APP_ENV_NAME__`/`__IS_PUBLIC_FACE__` define tokens, falling back to a `local` literal that mirrors `src/environments.ts`'s `LOCAL`, mirroring `src/env.ts`'s shape.
- [ ] T031 [US3] Verify server and frontend accessors agree for the same baked image and degrade to `local` together (quickstart V4 / SC-004).

**Checkpoint**: App code has a trustworthy, consistent `env` to branch on.

---

## Phase 6: User Story 4 — Documented upgrade for pre-feature apps (Priority: P4)

**Goal**: An app initialized before this change can reach the new model by following documentation only.

**Independent Test**: Following the documented steps against a pre-feature layout yields an app whose default path matches US1, with no spec citations in shipped files.

### Implementation for User Story 4

- [ ] T032 [US4] Rewrite the relevant `DEPLOY.md` sections to document the manifest model: `environments.json`, the suffix-agnostic derivation, the build→baked-identity flow (env-identity contract), the wildcard+`resolve-env` trigger, and that deploy service/host stay per-app (not in the manifest).
- [ ] T033 [US4] Add a `DEPLOY.md` "Upgrading an app initialized before the environment manifest" section: exact copy-pasteable diffs to (a) add `environments.json` seeded with the app's current two environments, and rewire (b) `derive-version.sh` reuse, (c) `server.ts` noindex, (d) the workflow trigger + `resolve-env`, plus the build-arg change. No automated script (FR-022). No spec citations (FR-023).
- [ ] T034 [US4] Dry-run the documented upgrade against a pre-feature layout (or a mental/fixture walkthrough) and confirm the result's default path matches US1 (quickstart V6 / SC-007).

**Checkpoint**: In-flight apps have a real, documented path.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Consistency, hygiene, and final validation across the feature.

- [ ] T035 [P] Run the Principle-VIII grep (quickstart V8): no shipped file (`environments.json`, scripts, configs, `DEPLOY.md`) references the spec workflow, FRs, or spec numbers. Fix any leak.
- [ ] T036 [P] Confirm the derivation scenario count did not grow per-environment (SC-006 / quickstart V7) — the matrix is behavior-sized.
- [ ] T037 Final `npm run check:all` + `npm run test:release` green on a clean tree (SC-008).
- [ ] T038 Verify the SPINUP mode-axis markers are untouched and the static/server + prerender axes still resolve correctly (environments are not a mode axis).
- [ ] T039 Fresh-app spin-up smoke: spin a new app from the template, confirm `environments.json` ships final/identical and `init.mjs` did not touch it (FR-003), and the default dev server + build work (Principle II).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — the manifest + reader come first.
- **Foundational (Phase 2)**: Depends on Setup (every consumer imports the reader / reads the manifest). BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Foundational — it verifies the foundation reproduced today's behavior. This is the MVP gate.
- **US2 (Phase 4)**: Depends on Foundational; reuses the US1 behavior matrix. Independent of US3/US4.
- **US3 (Phase 5)**: Depends on Foundational (baked identity exists). Independent of US2/US4.
- **US4 (Phase 6)**: Depends on Foundational being settled (it documents the final shape). Independent of US2/US3.
- **Polish (Phase 7)**: Depends on all desired stories complete.

### Within Foundational (ordering)

- T002 (reader) before everything that imports it (T009, T010, T012, T013, T029, T030).
- T003 (format parts) before T004/T007 (the parser-from-parts).
- T008 (Dockerfile ARG) before T011 (cloudbuild passes it) — but both after T009/T010 define how the name is consumed.

### Parallel Opportunities

- T003 is [P] within Setup.
- Within Foundational, the derivation tasks (T004–T007) and the identity tasks (T008–T013) touch different files and can largely proceed in parallel once T002/T003 land; the workflow tasks (T014–T016) are independent of both.
- US1 test tasks T017–T020 are [P] (different files). US3 accessor tasks T029/T030 are [P].
- US2, US3, US4 can be worked in parallel after Foundational (different files/areas).

---

## Parallel Example: Foundational

```bash
# After T002 (reader) + T003 (format parts), these clusters touch disjoint files:
# Derivation:
Task: "T004 suffix-agnostic reuse in scripts/derive-version.sh"
Task: "T005 manifest-driven suffix+branch validity in scripts/derive-version.sh"   # same file as T004 — serialize
# Identity (parallel to derivation):
Task: "T009 bake identity in vite.config.ts"
Task: "T010 mirror in scripts/prerender.mjs"
Task: "T013 facet-driven noindex in src/server.ts"
# Workflow (parallel to both):
Task: "T014 wildcard trigger in ci-cd.yml.disabled"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (the real work) → 3. Phase 3 US1 verification.
4. **STOP and VALIDATE**: the default path is byte-identical (the non-negotiable safety property).
5. The feature is shippable here — every app that never adds an environment is already served.

### Incremental Delivery

1. Setup + Foundational → the manifest drives everything.
2. US1 → byte-identical default proven (MVP).
3. US2 → adding an environment proven (the feature's reason for existing).
4. US3 → the typed accessor (the app-code payoff).
5. US4 → the documented upgrade (the in-flight path).

---

## Notes

- [P] = different files, no incomplete-task dependency. Tasks editing the same file (e.g. T004/T005 in `derive-version.sh`) are serialized.
- The Foundational phase is intentionally heavy; US1 is mostly verification because the foundation IS the byte-identical behavior.
- Keep prod byte-identical at every step; run `check:all` frequently.
- No shipped file may cite the spec workflow (Principle VIII) — enforced by T035.
- Commit after each task or logical group.
