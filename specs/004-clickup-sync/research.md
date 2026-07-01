# Research / Decisions: ClickUp Task Sync Extension

Phase 0 for `004-clickup-sync`. Resolves the design unknowns the plan flagged, grounded in
the **actual** ClickUp MCP tool surface (inspected during planning) rather than assumptions.
The most consequential finding (no checklist API) amended the spec mid-plan.

## Decision 1: Task lines render as markdown checkboxes in the US-subtask description (NOT native checklists)

- **Decision**: Each `tasks.md` line becomes a `- [ ] T001 …` markdown line inside the
  **markdown description** of its US-subtask (or the feature-card's own description for
  lines not attributable to a user story). The sync rewrites that description to add lines
  and flip boxes.
- **Rationale**: The connected ClickUp MCP server exposes **no checklist tool** — the
  creation surface is folder / list / list-in-folder / task / document / document-page /
  reminder. There is no `clickup_create_checklist` or `add_checklist_item`. Since FR-023
  mandates MCP-only access, native ClickUp checklist objects are unreachable, so the
  original "line = checklist item (ClickUp object)" model was **not implementable**.
  `clickup_create_task` / `clickup_update_task` accept `markdown_description`, so a checkbox
  list in the description is the faithful, MCP-reachable equivalent.
- **Alternatives considered**:
  - *Lines = nested subtasks* (real tasks two levels deep): gives per-line status/deps but
    multiplies ClickUp tasks per feature and write volume; rejected as heavier than the
    "lines are checkbox-shaped" intent that drove the earlier pivot.
  - *Native checklists*: impossible via MCP (the finding above).
- **Consequence**: A line has no independent status/assignee (it is body text) — acceptable;
  status lives on the feature-card (derived) and dependencies on the US-subtasks. Spec
  amended: Clarifications entry added, FR-002a / FR-003 and the two "checklist" entities
  reworded; the umbrella note defines "checklist" as this rendering everywhere else.

## Decision 2: ClickUp object mapping and the exact MCP tools per operation

- **Decision**: Fixed mapping and tool assignments —

  | Spec Kit thing | ClickUp object | MCP tool(s) |
  |---|---|---|
  | Project (repo) | Space + one shared List | `clickup_get_workspace_hierarchy` (find), `clickup_create_list` (create) |
  | Feature | Task ("feature-card") in the shared list | `clickup_create_task` / `clickup_update_task` (name, `markdown_description`, `status`) |
  | User story | Subtask under the card (`parent` = card id) | `clickup_create_task` with `parent`; `clickup_update_task` for body |
  | US ordering | Dependency between US-subtasks | `clickup_add_task_dependency` (`type: waiting_on`), `clickup_remove_task_dependency` |
  | Task line | `- [ ] T00x …` in the US-subtask `markdown_description` | folded into the US-subtask `update_task` call |
  | Derived status | The feature-card's `status` | `clickup_update_task` `status` (value from the recorded mapping) |

- **Rationale**: Every element is reachable with `create_task` (which supports `parent`,
  `markdown_description`, `status`, `tags`) + `update_task` + the dependency pair — no
  capability gap beyond checklists (Decision 1). Reads for reconciliation use
  `clickup_get_task`.
- **Alternatives considered**: tags for feature/phase (from the earlier tag clarification) —
  now largely moot because feature identity is the card itself and phase is the US-subtask;
  tags may still label the card but are not load-bearing.

## Decision 3: US dependencies derived from the spec's user-story numbering/priority

- **Decision**: The sync derives US-to-US "waiting_on" edges from the **user-story numbering
  in `spec.md`** (US1, US2, US3 … in the order they are defined, which is priority order),
  **not** from `tasks.md` phase order. This is critical: `tasks.md` deliberately reorders
  phases for implementation sequencing (e.g. provision-first puts US3's phase before US1's),
  so reading `tasks.md` section order would produce wrong edges. v1 uses the linear default
  from the spec's US sequence (US2 waits_on US1, US3 waits_on US1+US2, …), and MUST reconcile
  (add/remove) when that sequence changes (FR-007d).
- **Rationale**: Keeps v1 deterministic and repo-derived without inventing new `tasks.md`
  syntax. It satisfies "US3 depends on US1 and US2" for the common linear-priority case the
  user described.
- **Alternatives considered**: a new explicit `depends-on:` marker in `tasks.md` — deferred;
  would change the task format (out of scope for a tracker extension). Parsing prose "Why
  this priority" text for dependencies — too unreliable.
- **Open for /speckit-tasks**: if a feature declares non-linear US dependencies, v1 records
  the linear default and the author can adjust; a richer notation is backlog (005).

## Decision 4: Derived status from repo state

- **Decision** (canonical rule, matches FR-008): `not-started` = `spec.md` exists but no
  `plan.md`; `in-progress` = `plan.md` exists and not all tasks are checked (this includes
  `tasks.md` present with zero checked); `done` = `tasks.md` exists and all its tasks are
  checked. Computed each sync from file presence + checkbox counts.
- **Rationale**: Uses only signals the Spec Kit flow already produces (FR-008, spec
  Assumptions). Unambiguous and cheap.
- **Status-mapping resolution (provision)**: Read the list's available statuses via
  `clickup_get_list`; map the three logical states onto them (e.g. first not-done → not-started,
  a middle/in-progress status → in-progress, the list's closed/done status → done). If the
  list cannot represent all three, provisioning **stops and names the missing statuses**
  (FR-012) and records nothing. The resolved mapping is stored in the manifest.
- **Alternatives considered**: hardcode status names — rejected (breaks portability, FR-010).

## Decision 5: Manifest as dedup index + content hashing

- **Decision**: `specs/<feature>/.clickup-sync.json` (committed) records: workspace/space/
  shared-list IDs, the status mapping, the feature-card ID, each US-subtask ID + its
  dependency edges, and a content hash per synced element (card body, each US-subtask body,
  derived status). Sync computes create/update/skip by comparing freshly-derived hashes to
  the manifest; unchanged ⇒ no MCP call.
- **Hashing**: a stable hash (e.g. `sha256` via a shell helper) over the normalized derived
  content of each element. Deterministic, so a no-op run hashes equal and writes nothing
  (SC-002). No `Date.now()`/random in the hashed content.
- **Rationale**: Committed manifest makes dedup survive clones and collaborators, and scopes
  the namespace per feature so identical `T001`s across features never collide. Re-scanning
  the shared list is avoided (it holds other features' + unrelated cards; FR-017).
- **Alternatives considered**: gitignored/central manifest — rejected during clarify
  (breaks cross-clone dedup / merge-conflict magnet).

## Decision 6: Package shape mirrors the git-commit extension; two commands

- **Decision**: `.specify/extensions/clickup-sync/` with `extension.yml` (schema_version
  "1.0"), `config.yml`, `README.md`, `commands/{provision,sync}.md`, `scripts/bash/*.sh`;
  mirrored `.claude/skills/*/SKILL.md`; `installed:` + `hooks:` rows in
  `.specify/extensions.yml`. Repo-side logic (tasks.md parse, status derive, hashing,
  manifest I/O) lives in bash helpers reusing `common.sh` (`get_feature_paths`, `has_jq`,
  `json_escape`); the `.md` prompts own only ClickUp MCP orchestration.
- **Rationale**: `git-commit` is the proven in-repo extension package (taskstoissues is only
  a skill/core command, not a `.specify/extensions` package, so git-commit is the structural
  reference). Convention over configuration (Constitution II). Deterministic logic in shell
  is unit-testable (`derive-version.test.sh` style) without a live ClickUp.
- **Hooks**: `after_plan` → provision (optional); `after_tasks` + `after_implement` → sync
  (optional).

## Decision 7: Config placeholder carries no secrets

- **Decision**: `config.yml` ships with placeholders (`space: "<your-space-name>"`,
  `list: "<your-shared-list-name>"`). No workspace/space/list IDs, no credentials. Runtime
  IDs live only in the per-feature manifest (FR-021, SC-012). MCP handles auth entirely.
- **Rationale**: Shippable to collaborators (US4); the template stays generic.

## No remaining NEEDS CLARIFICATION

All Technical Context unknowns are resolved above. The one capability gap (checklists) was
found and designed around; the spec was amended to match. Ready for Phase 1.
