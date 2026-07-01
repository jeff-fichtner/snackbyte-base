# Data Model: ClickUp Task Sync Extension

Phase 1 for `004-clickup-sync`. Defines the committed manifest, the config placeholder, and
the entity → ClickUp-object mapping the sync maintains. All shapes are illustrative;
authoritative field lists are in `contracts/manifest.schema.md` and `contracts/config.schema.md`.

## Entity → ClickUp mapping (authoritative)

```text
Project (repo)      → ClickUp Space + one shared List           (one per repo)
Feature (specs/NNN) → Task "feature-card" in the shared List    (one per feature)
User story (US#)    → Subtask under the card (parent = card)    (one per user story)
US ordering         → waiting_on dependency between US-subtasks
Task line (T00x)    → "- [ ] T00x …" markdown line in the US-subtask description
Derived status      → the feature-card's ClickUp status         (via recorded mapping)
```

Correlation key is **(feature, task-ID)**; the per-feature manifest scopes it so identical
`T001`s across features never collide.

## Entity: Sync manifest — `specs/<feature>/.clickup-sync.json` (committed)

The single source of dedup + target location for one feature. Written by provision (targets)
and sync (element IDs + hashes); committed by the author with the other artifacts.

| Field | Type | Meaning | Set by |
|---|---|---|---|
| `schemaVersion` | string | Manifest format version (e.g. `"1"`) | provision |
| `workspaceId` | string | ClickUp workspace | provision |
| `spaceId` | string | Target space | provision |
| `listId` | string | Shared list holding all feature-cards | provision |
| `statusMapping` | object | logical → actual status names (see below) | provision |
| `feature` | string | Feature dir name, e.g. `004-clickup-sync` | provision |
| `card.id` | string | Feature-card ClickUp task ID | sync |
| `card.hash` | string | Hash of the derived card body + status | sync |
| `userStories[]` | array | One entry per user story | sync |
| `userStories[].us` | string | US identifier, e.g. `US1` | sync |
| `userStories[].id` | string | US-subtask ClickUp task ID | sync |
| `userStories[].hash` | string | Hash of the US-subtask body (incl. its checkbox list) | sync |
| `userStories[].dependsOn` | string[] | US identifiers this one waits_on | sync |

`statusMapping` example: `{ "not-started": "to do", "in-progress": "in progress", "done": "complete" }`
— the right-hand values are whatever the target list actually defines (resolved at provision).

### Manifest lifecycle / validation rules

- **Absent** → feature never provisioned; sync refuses (FR-011/014).
- **Present, no `listId`/`statusMapping`** → treated as un-provisioned; sync refuses.
- **`card.id` set but card missing in ClickUp** → sync recreates card + US-subtasks + deps,
  refreshes IDs (FR-018).
- **A `userStories[].id` missing in ClickUp** → recreate that US-subtask, re-point deps.
- Manifest is authoritative for create/update/skip; the shared list is never re-scanned for
  dedup (FR-017).
- Last-writer-wins on concurrent commits (accepted; edge case).

## Entity: Config placeholder — `.specify/extensions/clickup-sync/config.yml` (committed, secret-free)

```yaml
# Fill these in for your repo. NO IDs, NO credentials — the MCP server handles auth,
# and runtime IDs are resolved into each feature's .clickup-sync.json at provision time.
space: "<your-space-name>"          # ClickUp space the shared list lives in
list:  "<your-shared-list-name>"    # the one shared list all feature-cards go into
```

- MUST contain no workspace/space/list IDs and no secrets (FR-021, SC-012).
- The only knobs an adopter sets (US4 / SC-011).

## Derived (not stored) values

Computed each sync from repo state; only their **hashes** are persisted:

- **Card body** — markdown synthesized from: spec title + summary, the user-story list with
  priorities, and links/pointers to the artifacts that exist (spec/research/plan/tasks). Not
  the artifacts' full contents (FR-004a).
- **US-subtask body** — the story's title/why + its `- [ ] T00x …` checkbox list, boxes
  reflecting `tasks.md` done-state (FR-002a/003).
- **Derived status** — `not-started | in-progress | done` from file presence + checkbox
  counts (research Decision 4).
- **US dependency edges** — waiting_on edges from user-story ordering (research Decision 3).

## State transitions (feature-card status)

```text
(spec.md, no plan.md)            → not-started
(plan.md present, not all done)  → in-progress
(all tasks.md tasks checked)     → done
```

One-way: repo state drives the transition; ClickUp is overwritten to match, never read back
(FR-019/019a).
