# Contract: `speckit.clickup.provision`

**Hook**: `after_plan` (optional). **Skill mirror**: `speckit-clickup-provision`.

## Purpose

Ensure the ClickUp target for this repo exists and pin the status mapping, recording targets
into the active feature's manifest — so later sync runs never discover or guess. (US3.)

## Preconditions

- ClickUp MCP server connected.
- `.specify/extensions/clickup-sync/config.yml` filled (`space`, `list` not placeholders).
- Active feature resolvable via `get_feature_paths()`.

## Behavior

1. Read `config.yml` → `space`, `list` names. If still placeholders, stop and instruct.
2. `clickup_get_workspace_hierarchy` (max_depth 2) → locate the space by name.
   - 0 matches → create space is out of scope for MCP here: stop, tell operator to create
     the space (or, if the space exists but the list doesn't, proceed to create the list).
   - >1 matches → **ambiguous**: stop and ask operator to disambiguate (edge case).
3. Find the shared list by name under the space; if absent, `clickup_create_list`.
4. Read the list's statuses (`clickup_get_list`). Resolve `statusMapping` for
   not-started / in-progress / done. If any cannot be represented, **stop and name the
   missing statuses**; write nothing (FR-012, SC-007).
5. Write `workspaceId`, `spaceId`, `listId`, `statusMapping`, `feature` into
   `specs/<feature>/.clickup-sync.json` via `clickup-manifest.sh` (merge, don't clobber
   existing `card`/`userStories`).
6. Idempotent: re-running finds everything and rewrites the same values (SC-008).

## Postconditions / outputs

- Manifest has valid `listId` + `statusMapping`.
- Report: space/list found-or-created, mapping resolved, or the stop-reason.

## Failure modes

| Condition | Result |
|---|---|
| config still placeholder | stop, instruct to fill config |
| space not found / ambiguous | stop, instruct / disambiguate; write nothing |
| status set insufficient | stop, name needed statuses; write nothing |

## Never

- Never writes to the repo other than the manifest. Never touches unrelated cards.
