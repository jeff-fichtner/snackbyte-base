---
description: "Task list for the ClickUp Task Sync Extension"
---

# Tasks: ClickUp Task Sync Extension

**Input**: Design documents from `specs/004-clickup-sync/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included for the deterministic repo-side bash helpers only (parse / derive / hash /
manifest), matching the repo's `*.test.sh` convention. The ClickUp-MCP
orchestration in the command prompts is validated manually via quickstart.md (the MCP server
is not available headlessly), not by automated tests.

**Organization**: Grouped by user story. Note the package layout differs from a `src/` app —
everything lives under `.specify/extensions/clickup-sync/`, `.claude/skills/`, and
`.specify/extensions.yml` (see plan.md "Project Structure").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Exact file paths included in every task

## Path Conventions

- Extension package: `.specify/extensions/clickup-sync/`
- Command prompts: `.specify/extensions/clickup-sync/commands/*.md`
- Bash helpers + tests: `.specify/extensions/clickup-sync/scripts/bash/*.sh`
- Skill mirrors: `.claude/skills/speckit-clickup-*/SKILL.md`
- Hook wiring: `.specify/extensions.yml`

---

## Phase 1: Setup (Package Skeleton)

**Purpose**: Create the extension package scaffold, mirroring the existing `git-commit` extension.

- [X] T001 Create the package directory tree `.specify/extensions/clickup-sync/{commands,scripts/bash}/` and empty `README.md`
- [X] T002 Write `.specify/extensions/clickup-sync/extension.yml` (schema_version "1.0"; id `clickup-sync`; declare the two commands and their hook slots per plan.md), modeled on `.specify/extensions/git-commit/extension.yml`
- [X] T003 [P] Write the secret-free `.specify/extensions/clickup-sync/config.yml` placeholder (`space`/`list` = `<your-…>`) per contracts/config.schema.md
- [X] T004 [P] Write `.specify/extensions/clickup-sync/README.md` — what the extension is, how to configure, what it touches, and that it is MCP-only

---

## Phase 2: Foundational (Repo-Side Helpers — Blocking Prerequisites)

**Purpose**: The deterministic shell logic every command depends on. No ClickUp/MCP here — pure repo parsing, so it is unit-testable and must be solid before any command prompt is written.

**⚠️ CRITICAL**: No user-story command work should begin until these helpers exist and pass their tests.

- [X] T005 [P] Implement `.specify/extensions/clickup-sync/scripts/bash/clickup-manifest.sh` — read/merge/write `specs/<feature>/.clickup-sync.json` (subcommands: get-targets, set-targets, get-element, set-element), reusing `common.sh` (`get_feature_paths`, `has_jq`, `json_escape`) per contracts/manifest.schema.md
- [X] T006 [P] Implement `.specify/extensions/clickup-sync/scripts/bash/clickup-parse-tasks.sh` — parse `tasks.md` into US-grouped task lines with done-state, emit JSON (feature, per-US `- [ ] T00x` lines), falling back to an "unattributed" group per FR-002a
- [X] T007 [P] Implement `.specify/extensions/clickup-sync/scripts/bash/clickup-derive-status.sh` — map repo state (plan.md presence + checkbox counts) to `not-started|in-progress|done` per research Decision 4
- [X] T008 Add a stable content-hash helper (sha256 over normalized derived content) to `clickup-manifest.sh` (or a sibling `clickup-hash.sh`) so a no-op run hashes equal (SC-002); no time/random in hashed input
- [X] T009 [P] Test `clickup-parse-tasks.sh` in `.specify/extensions/clickup-sync/scripts/bash/clickup-parse-tasks.test.sh` (empty/malformed tasks.md, mixed checked/unchecked, unattributed lines), `*.test.sh` style
- [X] T010 [P] Test `clickup-derive-status.sh` in `.specify/extensions/clickup-sync/scripts/bash/clickup-derive-status.test.sh` (spec-only, mid-implement, all-checked)
- [X] T011 [P] Test `clickup-manifest.sh` + hashing in `.specify/extensions/clickup-sync/scripts/bash/clickup-manifest.test.sh` (round-trip, merge without clobber, stable no-op hash, no-jq fallback)

**Checkpoint**: Helpers pass their tests under `npm run check:all` conventions — command prompts can now be written on a trustworthy base.

---

## Phase 3: User Story 3 - Provision the shared home once (Priority: P2) 🎯 FOUNDATION-FIRST

> Ordered first among stories because provision is the runtime precondition for US1/US2 sync (a card can't be pushed to a list that isn't resolved). Still independently testable per its own criteria.

**Goal**: `/speckit-clickup-provision` find-or-creates the space + shared list, resolves & records the status mapping, writes targets into the manifest; fails loud on unusable status set.

**Independent Test**: From a repo with no recorded target, run provision → manifest has `listId` + `statusMapping` and the list exists; re-run → no duplicate, same IDs; point at a list with insufficient statuses → stops naming the missing ones, writes nothing.

- [X] T012 [US3] Write `.specify/extensions/clickup-sync/commands/speckit.clickup.provision.md` implementing contracts/provision.command.md: read config, `clickup_get_workspace_hierarchy` to locate space (handle 0/ambiguous), find-or-create list (`clickup_create_list`), resolve `statusMapping` from `clickup_get_list`, fail-loud if insufficient (FR-012), write targets via `clickup-manifest.sh`
- [X] T013 [P] [US3] Create the skill mirror `.claude/skills/speckit-clickup-provision/SKILL.md` (user-invocable) pointing at the provision command
- [X] T014 [US3] Register provision in `.specify/extensions.yml`: add `clickup-sync` to `installed:` and add the `after_plan` optional hook row for `speckit.clickup.provision`

**Checkpoint**: Provision works end-to-end against a real workspace (quickstart Scenario 1).

---

## Phase 4: User Story 1 - Rich, progressively-built feature-card (Priority: P1) 🎯 MVP

**Goal**: `/speckit-clickup-sync` materializes the feature-card at spec time and enriches it each stage — verbose body, one US-subtask per user story with dependency links, and a per-US markdown checkbox list once tasks exist — idempotently.

**Independent Test**: With only `spec.md`, sync → one card, verbose body, US-subtasks with dep links, no checkboxes; add `tasks.md`, sync → each US-subtask gains its `- [ ] T00x` list matching the repo; re-sync unchanged → zero writes; flip one task → exactly one checkbox changes.

- [X] T015 [US1] Write `.specify/extensions/clickup-sync/commands/speckit.clickup.sync.md` implementing contracts/sync.command.md: refuse if manifest lacks `listId`/`statusMapping`; derive body/US-subtasks/checkbox-lists/deps/status via the helpers; diff against manifest; create/update via `clickup_create_task`/`clickup_update_task` (card + `parent` subtasks + `markdown_description`); skip unchanged with zero MCP calls (SC-002)
- [X] T016 [US1] In sync, synthesize the verbose card body (spec summary + user-story list w/ priorities + artifact links, not full copies) per FR-004a
- [X] T017 [US1] In sync, render each user story as a US-subtask whose `markdown_description` holds the `- [ ] T00x …` checkbox list from `clickup-parse-tasks.sh`, boxes reflecting done-state (FR-002a/003); unattributed lines → card's own description. Rewrite the checkbox section of the description **wholesale** each run so a line removed from `tasks.md` disappears from the card (not just flips) — the "task line removed" edge case, no residual boxes
- [X] T018 [US1] In sync, implement progressive materialization: create the card as soon as `spec.md` exists (no `tasks.md` required), re-deriving everything each run (FR-007a/b). Reconcile with the empty/malformed-`tasks.md` edge case: a spec-present feature whose `tasks.md` yields zero recognizable lines still creates the card (body + status + US-subtasks) but adds **no** checkbox list — an absent/empty `tasks.md` is not the same as an absent spec, and no empty-checklist noise is produced
- [X] T019 [US1] In sync, set/reconcile US-subtask dependency links via `clickup_add_task_dependency`/`clickup_remove_task_dependency` from the **spec's user-story numbering/priority order** (NOT tasks.md phase order — research Decision 3; FR-007c/d)
- [X] T020 [US1] In sync, handle a missing card/subtask (`clickup_get_task` 404) by recreating and refreshing manifest IDs (FR-018); handle an **orphaned US-subtask** (a story removed/renumbered out of the spec) by — **v1 default: report it in the run summary and leave it in place (do NOT delete)** — and re-pointing its dependency edges so there is no silent drift (FR-007d, "user story removed/renumbered" edge case); write a per-run created/updated/skipped/orphaned summary (FR-007)
- [X] T021 [P] [US1] Create the skill mirror `.claude/skills/speckit-clickup-sync/SKILL.md` pointing at the sync command
- [X] T022 [US1] Register sync in `.specify/extensions.yml`: add the `after_tasks` and `after_implement` optional hook rows for `speckit.clickup.sync`

**Checkpoint**: MVP — a feature is a live, self-describing ClickUp card that enriches through the flow (quickstart Scenarios 2, 3, 5).

---

## Phase 5: User Story 2 - Derived status tracks the Spec Kit stage (Priority: P1)

**Goal**: The feature-card's status is computed each sync (not-started/in-progress/done) and written via the recorded mapping — never entered by hand.

**Independent Test**: Sync at spec-only, mid-implement, all-checked → status reads not-started, in-progress, done, with no manual change in ClickUp.

- [X] T023 [US2] In sync, compute status via `clickup-derive-status.sh` and write it on the card `clickup_update_task` using `statusMapping` (FR-008/009), recomputing every run
- [X] T024 [US2] Ensure status is set on the card even at spec-only stage (not-started), consistent with progressive materialization; only re-write when the mapped status changed (part of the skip/diff logic)

**Checkpoint**: Status progression verified (quickstart Scenario 4). US1+US2 together = the full MVP card.

---

## Phase 6: User Story 5 - One-way conformance (Priority: P2)

**Goal**: ClickUp is always overwritten toward the repo — hand-edits revert on the next sync.

**Independent Test**: Hand-edit an owned checkbox in ClickUp, sync → it reverts to match the repo.

- [X] T025 [US5] In sync, enforce repo-authoritative overwrite for every owned element (card body, US-subtask body/checkboxes, deps, status) — drift in ClickUp is corrected toward the repo, never merged back (FR-019a; quickstart Scenario 6)

**Checkpoint**: One-way conformance verified (quickstart Scenario 6).

---

## Phase 7: User Story 4 - Generic & shippable to collaborators (Priority: P3)

**Goal**: The extension drops into any repo with only `config.yml` filled; no secrets/IDs committed; package matches the other extensions.

**Independent Test**: In a clean checkout, set only `space`/`list` and run provision+sync against a different workspace; grep finds no secrets/IDs in the package; removing `specs/`+`.specify/` leaves no ClickUp references in shipped files.

- [X] T026 [P] [US4] Audit every committed package file for secrets / account / space / list IDs (only the runtime manifest may hold IDs) and document the check in README.md (SC-011)
- [X] T027 [P] [US4] Verify structural parity with `git-commit`/`agent-context` (extension.yml shape, command-file convention, skill mirrors, hook rows) and note any deviation in README.md (SC-012 boundary reminder: no ClickUp refs leak into shipped app source/docs/CI)

**Checkpoint**: Portability + hygiene verified (quickstart Scenario 7).

---

## Phase 8: Polish & Cross-Cutting

**Purpose**: Finalize docs, validate end-to-end, ensure the gate is green.

- [X] T028 [P] Complete `.specify/extensions/clickup-sync/README.md`: configuration, the two commands, hook slots, the no-checklist-API design note, and "MCP-only, one-way" guarantees
- [X] T029 Run `npm run check:all` (prettier over the new `.md`/`.yml`/`.json`, shell hygiene) and fix any formatting so the local gate is green
- [X] T030 **(manual — requires a live ClickUp workspace via the MCP server; not runnable headlessly)** Walk quickstart.md Scenarios 1–7 against a real ClickUp workspace and record results; fix any behavior gaps. Explicitly exercise the negative paths: provision against a list with insufficient statuses stops and names them and writes nothing (SC-007 / F4); a removed user story leaves no orphaned US-subtask (F5)
- [X] T031 [P] Confirm SC-012 by construction: `grep -ri clickup` over shipped app source/docs/CI (excluding `specs/`, `.specify/`, `.claude/`) returns nothing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all command work (commands call these helpers).
- **US3 Provision (Phase 3)**: After Foundational. Runtime precondition for US1/US2 sync.
- **US1 Sync (Phase 4)**: After Foundational; at runtime requires provision to have run, but the *command* can be authored in parallel with US3.
- **US2 Status (Phase 5)**: Extends the sync command (Phase 4) — same file, so sequential after US1's sync tasks.
- **US5 One-way (Phase 6)**: The one-way-overwrite task (T025) edits the sync command, so it follows Phase 4/5.
- **US4 Portability (Phase 7)**: After the package exists (audits the whole thing).
- **Polish (Phase 8)**: Last.

### User Story Dependencies

- **US3 (P2, provision)**: Independent to author; precondition at runtime for sync.
- **US1 (P1, sync/card)**: The MVP. Independently testable once provision has run.
- **US2 (P1, status)**: Edits the sync command; test independently by status progression.
- **US5 (P2, one-way)**: The one-way-overwrite task rides on the sync command.
- **US4 (P3, shippable)**: Cross-cutting audit; independent verification.

### Within Each User Story

- Helpers (Phase 2) before any command that calls them.
- Command prompt before its skill mirror before its hook registration.
- Overwrite/status tasks that edit `sync.md` are sequential (same file), not [P].

### Parallel Opportunities

- Setup: T003, T004 in parallel.
- Foundational: T005–T007 (distinct helper files) in parallel; then their tests T009–T011 in parallel.
- Skill mirrors (T015, T023, T029) are [P] with each other (distinct files).
- US4 audits (T031, T032) and Polish (T033, T036) in parallel.

---

## Parallel Example: Phase 2 Foundational

```bash
# Author the three independent helpers together (distinct files):
Task: "clickup-manifest.sh"      (T005)
Task: "clickup-parse-tasks.sh"   (T006)
Task: "clickup-derive-status.sh" (T007)

# Then their tests together:
Task: "clickup-parse-tasks.test.sh"   (T009)
Task: "clickup-derive-status.test.sh" (T010)
Task: "clickup-manifest.test.sh"      (T011)
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → Phase 2 Foundational (helpers + tests green).
2. Phase 3 US3 Provision (so there's a target) → Phase 4 US1 Sync + Phase 5 US2 Status.
3. **STOP and VALIDATE**: a feature is a live, self-describing card with derived status (quickstart 1–4). This is the demoable MVP.

### Incremental Delivery

1. Setup + Foundational → base ready.
2. + US3 provision → target exists.
3. + US1 sync + US2 status → **MVP** (card + checkboxes + deps + status).
4. + US5 one-way conformance → trustworthy mirror.
5. + US4 audit → shippable to collaborators.
6. Polish → docs + full quickstart pass.

---

## Notes

- This is a spec-workflow **extension**, not app code — paths are under `.specify/`/`.claude/`, and Constitution III/VIII keep ClickUp out of shipped app source/docs/CI.
- Tests cover the deterministic bash helpers only; MCP orchestration is validated by quickstart against a real workspace.
- The manifest is the only committed place runtime ClickUp IDs may appear; nothing else in the package carries IDs or secrets.
- Commit after each phase.
