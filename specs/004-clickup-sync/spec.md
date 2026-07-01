# Feature Specification: ClickUp Task Sync Extension

**Feature Branch**: `004-clickup-sync`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "A ClickUp tracking extension for Spec Kit that mirrors a feature's task list into ClickUp for project-management visibility. One-way push only: the repo is the source of truth and ClickUp is a read-only mirror — status never flows back into the repo. Mapping: each Spec Kit feature (specs/NNN-*) becomes a ClickUp List, and each tasks.md task (T001, T002, ...) becomes a ClickUp Task in that List; the task's phase / user-story marker ([US#], Setup, Polish) is carried as a ClickUp tag or custom field. The sync must be idempotent and cheap so it can run frequently without re-reading or duplicating: it is backed by a committed per-feature manifest file (specs/NNN-*/.clickup-sync.json) that stores the target ClickUp IDs (workspace/space/list) plus a map of each task ID to its ClickUp task ID and a content hash. On each run the sync parses tasks.md and diffs against the manifest — create tasks that are new, update tasks whose hash changed (text or done-state), and skip unchanged tasks with zero ClickUp calls. Provisioning is a separate, earlier responsibility: an early step ensures the ClickUp container (Space/Folder/List) for the feature exists and writes those target IDs into the manifest, so later frequent sync runs never have to guess or look them up. The extension must be generic and shippable to other people: no hardcoded account IDs or secrets committed — target Space is resolved from a templated config placeholder via find-or-create against the workspace hierarchy, and all ClickUp operations go through the connected ClickUp MCP server (no custom API/auth code). It provides two slash commands (provision and sync) and registers as optional lifecycle hooks (after_plan to provision, after_tasks and after_implement to sync), following the same extension package structure as the existing git-commit and taskstoissues extensions."

## User Scenarios & Testing *(mandatory)*

<!--
  These stories are written from the perspective of the people who use the Spec Kit
  workflow: the developer driving a feature, and the project lead / collaborators who
  watch progress in ClickUp. Each is independently testable against a real ClickUp
  workspace through the connected MCP server.
-->

### User Story 1 - See a feature's tasks in ClickUp without leaving the spec flow (Priority: P1)

A developer working a feature has just generated `tasks.md`. They want every task to
appear in ClickUp — one item per task — so the project lead can watch progress without
reading the repo. They run the sync; the project's shared ClickUp list now shows one
card per task, each labelled with which feature it belongs to and with its phase / user
story so it can be filtered and grouped by feature. They keep working, mark tasks done
in the repo, run the sync again, and the ClickUp cards reflect the new state. They never
touch the ClickUp UI to set this up, and re-running never produces duplicates.

**Why this priority**: This is the entire point of the extension — mirroring task
state into ClickUp. Without it there is no feature. It is the minimum viable slice:
even with nothing else, a developer can push tasks to ClickUp and re-push as they
progress.

**Independent Test**: From a feature that already has a populated `tasks.md` and a
provisioned shared list, run the sync once and confirm one ClickUp task exists per
`tasks.md` task in the shared list, each labelled with its feature and phase; mark a
task done in `tasks.md`, run again, and confirm exactly that one ClickUp task changed
and no duplicates were created.

**Acceptance Scenarios**:

1. **Given** a feature with N tasks in `tasks.md` and a provisioned shared list, **When** the sync runs, **Then** N ClickUp tasks for this feature are created in the shared list, each titled from its task line and labelled with its feature and its phase / user-story marker, and the manifest records each task's ClickUp ID and content hash.
2. **Given** a feature already synced once, **When** the sync runs again with no changes to `tasks.md`, **Then** no ClickUp tasks are created or modified and the run reports zero changes.
3. **Given** a feature already synced once, **When** one task's text or done-state changes in `tasks.md` and the sync runs, **Then** only that one ClickUp task is updated and all others are left untouched.
4. **Given** a feature already synced once, **When** a new task is added to `tasks.md` and the sync runs, **Then** exactly one new ClickUp task is created and the existing ones are unchanged.

---

### User Story 2 - Establish the shared ClickUp home once, early (Priority: P2)

Before tasks are pushed, the shared ClickUp list that will hold every feature's tasks
must exist, the feature/phase labels it relies on must exist, and that location must be
known. A developer (or an automatic step after planning) provisions: the extension
ensures the configured Space exists, ensures the project's shared list exists inside it,
ensures the feature and phase labels (tags or custom field options) exist, and records
those identifiers so every later sync run knows exactly where to write without searching
or guessing. If the list and labels already exist, provisioning recognises and records
them rather than creating duplicates.

**Why this priority**: Provisioning is a precondition for syncing, but it is a distinct,
infrequent responsibility. Separating it keeps the frequent sync cheap (it never has to
discover or create the list or labels) and gives one obvious place to see and change
where tasks are pushed. Because the list is shared across features, provisioning is
mostly a no-op after the first feature.

**Independent Test**: From a repo with no recorded ClickUp target, run provision and
confirm the manifest now records a workspace, space, and shared-list identifier and that
the list and the feature/phase labels exist in ClickUp; run provision again and confirm
no duplicate space, list, or label is created and the recorded identifiers are unchanged.

**Acceptance Scenarios**:

1. **Given** a configured target space name and no recorded ClickUp target, **When** provision runs, **Then** the project's shared list and the feature/phase labels exist under that space and the manifest records the workspace, space, and list identifiers.
2. **Given** the shared list already exists (provisioned by an earlier feature), **When** provision runs for a new feature, **Then** no new space, list, or label is created and the recorded identifiers are reused.
3. **Given** the configured target space does not yet exist, **When** provision runs, **Then** the space is created (or the operator is told it must be created) before the list, and the resulting identifiers are recorded.

---

### User Story 3 - Drop the extension into any repo and ship it to collaborators (Priority: P3)

Someone who is not the original author adds this extension to their own Spec-Kit-based
repo. They set the target space name in a configuration placeholder, and the extension
works against their own ClickUp workspace. Nothing in the committed extension carries
the original author's account, space identifiers, or credentials. The extension's
package layout, command files, and hook registration match the other extensions in the
repo, so it is recognisable and maintainable.

**Why this priority**: Genericity and shippability make this a reusable extension
rather than a one-off script, but they are a quality attribute layered on top of the
core sync; the feature delivers value to its author even before it is portable.

**Independent Test**: Inspect the committed extension and manifest for any literal
account-specific identifier or secret (there must be none); set only the configured
space name and run provision + sync in a different workspace, confirming it operates
against that workspace.

**Acceptance Scenarios**:

1. **Given** the committed extension files, **When** they are inspected, **Then** no ClickUp credential, account identifier, or pre-bound space/list identifier appears anywhere except the per-feature manifest produced at runtime.
2. **Given** a fresh repo with the extension installed and only the target space name configured, **When** provision and sync run, **Then** they operate against the configured workspace without further author-specific setup.
3. **Given** the extension package, **When** its structure is compared to the existing git-commit and taskstoissues extensions, **Then** it follows the same package layout, command-file convention, and hook-registration mechanism.

---

### Edge Cases

- **Shared list missing at sync time**: A sync runs when the manifest has no shared-list identifier (never provisioned). The sync must refuse with a clear instruction to provision first, rather than silently creating the list or writing to the wrong place.
- **Same task ID across features**: Two different features both contain `T001`. Because all tasks share one list, the sync MUST correlate by the (feature, task-ID) pair — never by bare task ID — so feature 005's `T001` is a distinct ClickUp task from feature 004's `T001` and the two never collide or overwrite each other.
- **Task removed from `tasks.md`**: A task that was previously synced no longer appears in `tasks.md`. The default is to leave the corresponding ClickUp task in place (one-way push does not delete), report it as orphaned, and not error — deletion semantics are out of scope for the first version.
- **Manifest and ClickUp disagree**: The manifest records a ClickUp task ID that no longer exists in ClickUp (deleted in the UI). The sync must detect the missing target on update and recreate it (and refresh the manifest) rather than failing the whole run.
- **Two collaborators sync the same feature**: Because the manifest is committed, a second collaborator inherits the recorded IDs and updates the same ClickUp tasks rather than creating a parallel set. Concurrent runs that both create are a known race; the manifest's committed nature is the mitigation, and last-writer-wins on the manifest is acceptable.
- **Malformed or empty `tasks.md`**: No recognisable task lines are found. The sync makes no ClickUp changes and reports that there was nothing to sync.
- **Phase / user-story marker absent on a task**: A task line carries no `[US#]` / phase marker. The task is still synced; the phase label is simply omitted for that task.
- **Workspace hierarchy lookup returns multiple spaces with the configured name**: Provision must not guess; it reports the ambiguity and asks the operator to disambiguate rather than picking one arbitrarily.
- **Shared list shared with non-spec tasks**: The configured list may already contain tasks created by hand or by other tooling. The sync MUST only ever touch tasks it created (those recorded in a manifest); it MUST NOT modify or count unrelated tasks in the shared list.

## Requirements *(mandatory)*

### Functional Requirements

#### Mapping & sync (US1)

- **FR-001**: The extension MUST mirror each task in a feature's `tasks.md` as exactly one ClickUp task within the project's single shared ClickUp list; it MUST NOT create a separate list per feature.
- **FR-002**: The extension MUST title each ClickUp task from its `tasks.md` task line, preserving the task identifier (e.g. `T001`) so a human and the sync can both correlate the two.
- **FR-003**: The extension MUST carry each task's owning feature (e.g. `004-clickup-sync`) onto its ClickUp task as a label (tag or custom field) so tasks in the shared list can be filtered and grouped by feature.
- **FR-003a**: The extension MUST carry each task's phase / user-story marker (e.g. `Setup`, `[US1]`, `Polish`) onto its ClickUp task as a label (tag or custom field), and MUST omit the phase label gracefully when a task has no marker.
- **FR-003b**: Because the shared list mixes tasks from multiple features, the extension MUST correlate a `tasks.md` task to its ClickUp task by the (feature, task-ID) pair, never by bare task ID, so identical task IDs in different features never collide.
- **FR-004**: The extension MUST reflect a task's done-state from `tasks.md` (checked vs unchecked) onto the corresponding ClickUp task's status.
- **FR-005**: The sync MUST be idempotent: running it repeatedly with no change to `tasks.md` MUST make no ClickUp modifications and MUST create no duplicate tasks.
- **FR-006**: On each sync run the extension MUST classify every task as new (create), changed (update), or unchanged (skip) by comparing against the manifest, and MUST make no ClickUp call for unchanged tasks.
- **FR-007**: The sync MUST report a per-run summary of how many tasks were created, updated, and skipped.

#### Provisioning (US2)

- **FR-008**: The extension MUST provide a provisioning step, separate from sync, that ensures the configured space, the project's single shared list, and the feature/phase labels exist, and records their identifiers in the manifest.
- **FR-009**: Provisioning MUST be find-or-create: if the target space, shared list, and/or labels already exist (e.g. provisioned by an earlier feature), it MUST adopt and record them rather than create duplicates.
- **FR-010**: After provisioning, the manifest MUST contain the workspace, space, and shared-list identifiers sufficient for sync to operate without any further discovery.
- **FR-011**: The sync MUST refuse to run (with a clear instruction to provision first) when the manifest has no recorded shared-list identifier, rather than create the list itself.

#### Manifest (US1, US2)

- **FR-012**: The extension MUST persist per-feature sync state in a committed manifest file located within the feature's own directory.
- **FR-013**: The manifest MUST record the shared-list identifier and, for each synced task, its task identifier (scoped to this feature), its ClickUp task identifier, and a content hash capturing the task's text and done-state.
- **FR-014**: The manifest MUST be the authoritative dedup index: the sync MUST determine create/update/skip from the manifest, not from re-scanning the shared list (which also holds other features' and unrelated tasks).
- **FR-015**: When the manifest references a ClickUp task that no longer exists, the sync MUST recreate it and refresh the manifest rather than fail the run.

#### Direction & scope

- **FR-016**: The synchronisation MUST be one-way (repo → ClickUp). The extension MUST NOT modify `tasks.md` or any repo artifact based on ClickUp state.
- **FR-017**: The extension MUST NOT delete ClickUp tasks for tasks removed from `tasks.md` in this version; it MUST report such tasks as orphaned and continue.

#### Genericity & shippability (US3)

- **FR-018**: The committed extension MUST NOT contain any ClickUp credential, secret, account identifier, or pre-bound space/list identifier; the only place runtime ClickUp identifiers appear is the per-feature manifest produced at runtime.
- **FR-019**: The target space and the shared list name MUST be selectable through a configuration placeholder that a new adopter fills in, with no code changes required to retarget the extension at a different workspace, space, or list.
- **FR-020**: All ClickUp operations MUST go through the connected ClickUp integration (MCP server); the extension MUST NOT implement its own ClickUp API client, authentication, or credential storage.
- **FR-021**: The extension MUST provide two operator-invocable commands — one to provision, one to sync — and MUST register them as optional lifecycle hooks: provisioning after planning, and sync after task generation and after implementation.
- **FR-022**: The extension MUST follow the same package structure, command-file convention, and hook-registration mechanism as the existing git-commit and taskstoissues extensions, and MUST be installable/removable through the same extension mechanism without affecting other extensions.

#### Boundary (template hygiene)

- **FR-023**: The extension MUST live entirely within the spec-workflow scaffolding space (the extension and command directories and the per-feature manifest under the feature's spec folder) and MUST NOT introduce ClickUp references into shipped application source, shipped documentation, or build/CI files.

### Key Entities

- **Feature task**: A single line in a feature's `tasks.md`, identified within its feature by its task ID (e.g. `T001`), carrying a description, an optional phase / user-story marker, and a done-state (checked/unchecked). The unit that is mirrored. Globally identified by the (feature, task-ID) pair.
- **Shared ClickUp list (per project)**: The single ClickUp list that holds the mirrored tasks of every feature in the repo. One per project, not one per feature.
- **ClickUp task (per feature task)**: The mirror of a single feature task inside the shared list, carrying the title, a feature label, a phase label, and a status.
- **Feature label / phase label**: Tags or custom-field values applied to each ClickUp task so the shared list can be filtered and grouped by feature and by phase.
- **Sync manifest (per feature)**: The committed record, stored in the feature's own directory, holding the target ClickUp identifiers (workspace, space, shared list) and, per feature task, its ClickUp task ID and content hash. Serves as both the target locator and the dedup index, scoped to one feature.
- **Target configuration**: The adopter-supplied setting (a placeholder filled in per repo) naming the ClickUp space and shared list the tasks should live in. Contains no secrets.
- **Extension package**: The installable unit (declaration, command files, optional scripts, hook registrations) that delivers provisioning and sync, parallel to the existing extensions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a single sync of a feature with N tasks, the shared list contains exactly N tasks labelled with that feature — no more, no fewer — each correctly titled and labelled with its feature and phase, and no task belonging to another feature is affected.
- **SC-002**: Re-running the sync with no `tasks.md` changes results in zero ClickUp tasks created or modified (a true no-op), verifiable from the run's reported summary.
- **SC-003**: Changing exactly one task in `tasks.md` and re-syncing modifies exactly one ClickUp task and leaves every other unchanged.
- **SC-004**: Provisioning a second feature creates no new space or list; it reuses and reports the shared-list identifiers established by the first feature, and provisioning twice for the same feature creates nothing the second time.
- **SC-008**: Two features that each contain a task `T001` produce two distinct ClickUp tasks in the shared list; neither sync overwrites the other's `T001`.
- **SC-005**: A person other than the author can install the extension, set only the target space and shared-list name, and successfully provision and sync against their own ClickUp workspace without editing any command or script file.
- **SC-006**: Inspection of every committed file in the extension finds zero ClickUp credentials, account identifiers, or pre-bound space/list identifiers.
- **SC-007**: With `specs/` and `.specify/` removed, no remaining shipped file references ClickUp — confirming the integration stays within spec-workflow scaffolding.

## Assumptions

- A ClickUp integration (MCP server) is already connected and authenticated in the environment where the commands run; the extension consumes it and does not manage credentials.
- The adopter has permission in their ClickUp workspace to create (or already has) the target space and to create the shared list, labels, and tasks within it.
- All features in one repo share a single ClickUp list; a feature is distinguished by a label on each task, not by its own list. The list's lifespan is the project's, not any one feature's.
- `tasks.md` follows the established Spec Kit convention: tasks are markdown checkbox lines whose IDs are `T` followed by three digits, optionally carrying `[P]` and `[US#]` / phase markers, as produced by `/speckit-tasks`.
- The feature directory is the per-feature location already resolved by the Spec Kit flow (via `.specify/feature.json`), and the manifest lives alongside the other artifacts there.
- "Phase / user-story marker" is whatever grouping `tasks.md` already encodes (e.g. `Setup`, `[US1]`, `Polish`); the extension reflects that grouping rather than inventing its own taxonomy.
- This extension is a template-level improvement to the Spec Kit scaffolding (the same tier as the existing extensions), not application logic; it ships with the template and is available to every app spun up from it, but the apps' shipped code does not depend on it.
- Versioning of this extension follows the repo's existing release-derivation conventions; as the fourth feature it is expected to land under the corresponding minor version line (the `vX.4.x` series). The exact mechanism is a planning concern, not a spec requirement.
- The first version is push-and-update only; deletion/archival of ClickUp tasks for removed `tasks.md` entries and any back-sync of status into the repo are explicitly out of scope.
