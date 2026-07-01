# Contract: `speckit.clickup.sync`

**Hooks**: `after_tasks` + `after_implement` (optional). **Skill mirror**: `speckit-clickup-sync`.

## Purpose

Make the feature's ClickUp representation match the committed repo: one feature-card, a
US-subtask per user story (with dependency links and a checkbox list of task lines), a
verbose body, and a derived status. One-way, idempotent, cheap. (US1, US2, US5.)

## Preconditions

- ClickUp MCP server connected.
- Manifest has `listId` + `statusMapping` (else **refuse**, instruct to provision — FR-011/014).
- `spec.md` exists (card materializes at spec; does not require `tasks.md` — FR-007a).

## Behavior (each run)

1. Resolve feature dir; load manifest.
2. **Derive** (repo-side, `clickup-*` bash helpers, no MCP):
   - card body (spec summary + US list + artifact links),
   - user stories + their `- [ ] T00x` checkbox lines grouped by US (`clickup-parse-tasks.sh`),
   - US dependency edges (document-order default; research Decision 3),
   - status (`clickup-derive-status.sh`),
   - a content hash per element.
3. **Diff** each element's fresh hash against the manifest → create / update / skip. Skipped
   elements incur **zero** MCP calls (SC-002).
4. **Apply** via MCP, toward the repo (overwrite drift, never merge back — FR-019a):
   - card: `clickup_create_task` (first run) / `clickup_update_task` (name,
     `markdown_description`, `status` from mapping),
   - each US-subtask: `create_task` with `parent`=card / `update_task` (body incl. checkbox
     list),
   - dependencies: `clickup_add_task_dependency` / `remove_task_dependency` to reconcile
     (FR-007d),
   - if a referenced card/subtask is missing in ClickUp (`clickup_get_task` 404), recreate
     and refresh IDs (FR-018).
5. Rewrite the manifest IDs + hashes.
6. **Report** created/updated/skipped counts (FR-007).

## Postconditions / outputs

- ClickUp matches the committed repo for every owned element.
- Manifest hashes equal the just-derived content (next run is a no-op if nothing changed).

## Failure modes

| Condition | Result |
|---|---|
| no `listId`/`statusMapping` | refuse; instruct to provision |
| empty/malformed `tasks.md` | card + US-subtasks still sync; no empty checkbox noise; report "nothing to sync" for lines |
| unrelated cards in shared list | never read for dedup, never modified |

## Never

- Never modifies `tasks.md` or any repo artifact (FR-019). Never deletes a whole tracked card
  for a removed feature in v1 (reports it). Never sets lifecycle/human states (FR-020).
