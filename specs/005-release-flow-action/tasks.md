---
description: "Task list for Consume the Release-Flow GitHub Action"
---

# Tasks: Consume the Release-Flow GitHub Action

**Input**: Design documents from `specs/005-release-flow-action/` (spec.md). The implementation
design lives in the Action repo (`snackbyte-release-flow-action`: `action.yml`, `CONSUMING.md`) — this
is a lean spec; there is no separate plan/research/data-model here.

**Prerequisites**: spec.md. The Action's `@v1` is live (verified 2026-07-06).

**Tests**: Behavior parity is the correctness bar. This feature deletes the local test suite (it tested
the deleted scripts); parity is verified against the Action's own passing suite plus the surviving
`check:all` gate and a wired throwaway repo. No new local derivation tests are added (the logic no
longer lives here).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US3); Setup/Polish carry no label
- Paths are repo-root-relative.

---

## Phase 1: Setup (confirm the seam before cutting)

**Purpose**: Establish the ground truth this refactor depends on, so the deletion is safe.

- [ ] T001 Confirm `jeff-fichtner/snackbyte-release-flow-action@v1` resolves on GitHub (annotated tag, points at a released commit) and that its `action.yml` contract matches what `spec.md` §Context assumes (inputs: `branch`/`manifest`/`major-minor`/`version-strategy`; outputs: `is-env`/`version`/`tag`). Record the resolved SHA in the PR description. (Done in spec authoring: v1 → 1d897e7; re-confirm at implement time.)
- [ ] T002 Inventory the CI-side release logic to delete vs. the app-runtime half to keep. Deletion set: `scripts/derive-version.sh`, `scripts/derive-version.test.sh`, `scripts/add-env.test.sh`, the inline `resolve-env` node lookup + `version-and-tag` derivation in `.github/workflows/ci-cd.yml`, the `test:release` script + its CI invocations. Keep set (DO NOT TOUCH): `environments.json`, `scripts/resolve-env.mjs`, `src/environments.ts`, `src/env.ts`, `src/web/env.ts`, `src/routes/version.ts`, `src/version.ts`, `src/web/version.ts`. (I2/I3.) NOTE: the three deleted test files form one chain — `test:release` (package.json) runs `derive-version.test.sh`, which internally invokes `add-env.test.sh` (see `derive-version.test.sh:~232`). Deleting all three + removing `test:release` leaves nothing dangling; the `[P]` on T006/T007 is safe because all three are being removed together.

**Checkpoint**: The Action is confirmed consumable and the exact seam is written down.

---

## Phase 2: US1 + US2 — Delegate the CI-side flow to the Action (Priority: P1)

**Purpose**: Replace the inline release logic with a call to the Action (US1: same tags out) and remove
the superseded local logic (US2: no duplication left behind). These are one edit to `ci-cd.yml` plus
the deletions, so they land together.

**⚠️ Sequence**: Wire the Action (T003–T005) BEFORE deleting the scripts (T006–T008) so the workflow is
never in a state that references a deleted file with no replacement.

- [ ] T003 [US1] In `.github/workflows/ci-cd.yml`, replace the inline `resolve-env` job's node lookup and the `version-and-tag` job's hand-written `Derive version and tag` step with a single `uses: jeff-fichtner/snackbyte-release-flow-action@v1` step. Keep the surrounding job structure (the PR merge-gate `validate` job, the push-side `check:all` gate). Gate the Action's tag step on the quality gate passing (FR-003).
- [ ] T004 [US1] Ensure the Action's job provides `fetch-depth: 0` on checkout, `permissions: contents: write`, and a per-branch `concurrency: group: …-${{ github.ref }}, cancel-in-progress: false` (FR-002). Rely on the Action's input defaults; do NOT set `version-strategy` (deployable-app default `build-id`, FR-002/design fact 4).
- [ ] T005 [US1] Consume the Action's outputs where the old job's outputs were used: gate any downstream step on `steps.<id>.outputs.is-env == 'true'` and reference `outputs.version` / `outputs.tag` (FR-001). Confirm the template ships no deploy job (per its existing convention) so there is nothing further to rewire.
- [ ] T006 [P] [US2] Delete `scripts/derive-version.sh` (FR-004).
- [ ] T007 [P] [US2] Delete `scripts/derive-version.test.sh` and `scripts/add-env.test.sh` (FR-004).
- [ ] T008 [US2] Remove the `test:release` script from `package.json` and every `npm run test:release` invocation from `ci-cd.yml` (both the merge gate and the push gate). Leave `check:all` intact (FR-005).

**Checkpoint**: The workflow calls the Action; no local derivation logic or `test:release` reference
remains. `npm run check:all` passes locally.

---

## Phase 3: US3 — Prove the app-runtime half is untouched (Priority: P1)

**Purpose**: The guardrail. Confirm the deletion did not cross into the manifest's app-runtime half.

- [ ] T009 [US3] Diff the branch against `main` and confirm the deletion set (Phase 2) is the ONLY release/tooling change; assert zero edits to `environments.json`, `scripts/resolve-env.mjs`, `src/environments.ts`, `src/env.ts`, `src/web/env.ts`, the `/api/version` + version-chip surface (`src/routes/version.ts`, `src/version.ts`, `src/web/version.ts`), and no app-source (`src/**`) churn beyond what a doc/CI change requires (I2/I3, FR-006/FR-007).
- [ ] T010 [US3] Exercise the app-runtime identity path still works: build (or `npm run dev`) and confirm `resolveBuildEnv()` reads `environments.json`, `/api/version` reports the expected identity, `noindex` is emitted for the no-index environment, and the version chip visibility rule is unchanged (SC-005).

**Checkpoint**: The app-runtime half is provably unchanged and still functions.

---

## Phase 4: Polish — Docs and end-to-end parity

**Purpose**: Bring the prose in line with the new topology and prove parity end-to-end.

- [ ] T011 [P] Update `.github/workflows/ci-cd.yml` header comments: describe consuming the Action for resolve-env + version derivation, drop the description of the in-repo `scripts/derive-version.sh` mechanics (FR-008).
- [ ] T012 [P] Update `DEPLOY.md` where it describes the release flow as in-repo scripts → describe consuming the Action; add the app-vs-library `version-strategy` note (app = `build-id` default; a spun-up library flips to `package-json`); link the Action's `CONSUMING.md` rather than duplicating it (FR-008, SC-006).
- [ ] T013 [P] Reconcile `CLAUDE.md` (and any other template prose) that points at spec-002/003 as "the release flow lives here" so it reflects delegation to the Action. Do not disturb the spec-002/003 historical records themselves.
- [ ] T014 End-to-end parity check: on a throwaway repo (or a scratch branch wired to the Action), push to an environment branch and to a non-environment branch; confirm the environment push yields the expected `vMM.P`(`-suffix`) tag and the non-environment push yields `is-env=false` with no tag and no failure (SC-001/SC-002, I1). Record the observed tags in the PR.
- [ ] T015 Final gate: `npm run check:all` green; grep confirms zero references to `derive-version.sh`, the inline resolve-env node lookup, or `test:release` anywhere outside historical specs (SC-003/SC-004).

---

## Dependencies & ordering

- T001–T002 (setup) before everything.
- **T003–T005 (wire the Action) before T006–T008 (delete the scripts)** — never leave the workflow
  referencing a deleted file with no replacement.
- T006/T007 are `[P]` (distinct file deletions). T008 edits `ci-cd.yml` + `package.json` — serialize
  against T003–T005 (same `ci-cd.yml`).
- Phase 3 (US3 verification) after Phase 2 (there must be a diff to inspect).
- Phase 4 docs `[P]` among themselves (distinct files); T014/T015 (parity + final gate) last.

## Notes

- **Behavior parity is the whole game (I1)**: this refactor must not change the tag any push produces.
  If T014 shows a different number than the pre-refactor script would have, stop — the Action's
  contract diverged and that is a blocker, not a tweak here.
- **The split is load-bearing (I3)**: if implementing a task tempts an edit to `environments.json` or
  any app-runtime reader, the CI/app seam has been crossed — back out and re-scope.
