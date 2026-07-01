# Quickstart / Validation: ClickUp Task Sync Extension

Proves the extension end-to-end against a **real** ClickUp workspace (the MCP server is not
available in headless CI, so ClickUp-touching validation is manual; the repo-side helpers are
covered by shell tests). Maps each step to the success criteria it demonstrates.

## Prerequisites

- ClickUp MCP server connected and authenticated in the running agent.
- A ClickUp space you can create lists/tasks in.
- The extension installed: `.specify/extensions/clickup-sync/` present and listed under
  `installed:` in `.specify/extensions.yml`.
- `.specify/extensions/clickup-sync/config.yml` filled with your real `space` and `list`
  names (not the `<your-…>` placeholders).

## Setup

```bash
# From repo root, confirm the extension's shell helpers pass their unit tests (no ClickUp needed):
bash .specify/extensions/clickup-sync/scripts/bash/clickup-parse-tasks.test.sh
bash .specify/extensions/clickup-sync/scripts/bash/clickup-derive-status.test.sh
```

## Scenario 1 — Provision (US3 / SC-007, SC-008)

Run `/speckit-clickup-provision` (or let the `after_plan` hook offer it) on a feature.

**Expect**: the shared list exists under your space; `specs/<feature>/.clickup-sync.json` now
has `listId` + `statusMapping`. Run it again → no duplicate list, same IDs (SC-008).

**Negative**: point `config.yml` at a list whose statuses can't express not-started/
in-progress/done → provision **stops** and names the missing statuses; manifest unchanged
(SC-007).

## Scenario 2 — Sync at spec stage, before tasks (US1 / SC-004)

On a feature that has only `spec.md` (no `tasks.md`), run `/speckit-clickup-sync`.

**Expect**: one feature-card in the shared list with a non-empty body (spec summary + user
stories + links), one US-subtask per user story, US dependency links matching the spec's
story order, and **no** checkbox list yet. Status = not-started (SC-004, first state).

## Scenario 3 — Sync with tasks + idempotence (US1 / SC-001, SC-002, SC-003)

Add `tasks.md`, run sync.

**Expect**: each US-subtask's description gains a `- [ ] T00x …` checkbox list matching the
repo; totals match `M` user stories / `N` task lines (SC-001). Run sync again with no changes
→ zero ClickUp writes, reported as a no-op (SC-002). Check off exactly one task in `tasks.md`,
sync → exactly one checkbox flips; nothing else changes (SC-003).

## Scenario 4 — Derived status progression (US2 / SC-004, SC-006)

Sync at three points: spec-only, mid-implement (some tasks checked), all checked.

**Expect**: card status reads not-started → in-progress → done, with no manual status change
in ClickUp (SC-004). Provisioning a second feature reuses the list + mapping (SC-006).

## Scenario 5 — Dependencies reconcile (US1 / SC-005)

Change the user-story ordering (make US3 no longer depend on US2), sync.

**Expect**: the corresponding US-subtask dependency links are updated; no stale links remain
(SC-005).

## Scenario 6 — One-way conformance (US5 / SC-009)

- Hand-edit a checkbox in a US-subtask description in the ClickUp UI, then sync.
  **Expect**: it reverts to match the repo (SC-009) — ClickUp conforms to the repo, never the
  reverse.

## Scenario 7 — Portability + hygiene (US4 / SC-010, SC-011, SC-012)

- In a clean checkout, set only `config.yml`'s `space`/`list` and run provision + sync
  against a different workspace — works with no code edits (SC-010).
- `grep -ri clickup .specify/extensions/clickup-sync | grep -Ei '<a-secret-or-id-pattern>'`
  finds nothing (SC-011).
- Temporarily remove `specs/` and `.specify/` in a scratch copy → no shipped file references
  ClickUp (SC-012).

## Reference

- Command behavior: [contracts/](contracts/) (provision / sync).
- Manifest & config shapes: [contracts/manifest.schema.md](contracts/manifest.schema.md),
  [contracts/config.schema.md](contracts/config.schema.md).
- Design rationale (incl. the no-checklist-API finding): [research.md](research.md).
