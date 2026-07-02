# Feature Specification: ClickUp Task Sync Extension

**Feature Branch**: `004-clickup-sync`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "A ClickUp tracking extension for Spec Kit that mirrors a feature's task list into ClickUp for project-management visibility. One-way push only: the repo is the source of truth and ClickUp is a read-only mirror — status never flows back into the repo. Mapping: each Spec Kit feature (specs/NNN-*) becomes a ClickUp List, and each tasks.md task (T001, T002, ...) becomes a ClickUp Task in that List; the task's phase / user-story marker ([US#], Setup, Polish) is carried as a ClickUp tag or custom field. The sync must be idempotent and cheap so it can run frequently without re-reading or duplicating: it is backed by a committed per-feature manifest file (specs/NNN-*/.clickup-sync.json) that stores the target ClickUp IDs (workspace/space/list) plus a map of each task ID to its ClickUp task ID and a content hash. On each run the sync parses tasks.md and diffs against the manifest — create tasks that are new, update tasks whose hash changed (text or done-state), and skip unchanged tasks with zero ClickUp calls. Provisioning is a separate, earlier responsibility: an early step ensures the ClickUp container (Space/Folder/List) for the feature exists and writes those target IDs into the manifest, so later frequent sync runs never have to guess or look them up. The extension must be generic and shippable to other people: no hardcoded account IDs or secrets committed — target Space is resolved from a templated config placeholder via find-or-create against the workspace hierarchy, and all ClickUp operations go through the connected ClickUp MCP server (no custom API/auth code). It provides two slash commands (provision and sync) and registers as optional lifecycle hooks (after_plan to provision, after_tasks and after_implement to sync), following the same extension package structure as the existing git-commit and taskstoissues extensions."

## Clarifications

### Session 2026-07-01

- Q: How should the extension attach the feature and phase to each ClickUp task? → A: ClickUp tags (one tag per feature, one per phase) — no schema setup, filter/group by tag. **(Superseded by the mapping pivot below — tasks.md lines are no longer ClickUp tasks, so per-line tags no longer apply.)**
- Q: What does one Spec Kit feature map to in ClickUp? → A: **A pivot** — one feature = one ClickUp **Task**; each `tasks.md` line = a **checklist item** inside that feature-Task; all features share one project-level list. (Individual lines are checkbox-shaped, not full tasks.)
- Q: How is the feature-Task's status driven? → A: Derived from the Spec Kit flow phase, collapsed to the minimal unambiguous set for this version — **not-started** (no plan yet) / **in-progress** (implementing) / **done** (all tasks checked). One-way; repo is source of truth.
- Q: What is in scope for this version vs. backlogged? → A: **Immediate (thin)** — feature=Task, lines=checklist items, derived 3-state status. **Backlogged to a separate spec** — the full lifecycle (planning/review/testing), human-testing handoff, and a lighter mode for manual/one-off work outside the Spec Kit pipeline.
- Q: When does the ClickUp card exist and what does it show? → A: **Materialize at spec, enrich each stage.** The card is created as soon as `spec.md` exists and its body is re-synthesized each sync as later artifacts (research, requirements, tasks) land — not gated on `tasks.md`.
- Q: What populates the card body? → A: **Spec summary + user stories + pointers/links** (verbose about the what/why, but linking out to artifacts rather than copying research/requirements wholesale).
- Q: Dependencies — at what level and how represented? → A: **User-story level, via a US layer.** Each user story becomes a **subtask** under the feature-card and carries **native ClickUp dependency links** (e.g. US3 waits-on US1 & US2). Task lines become **checkbox lines inside their US-subtask** (see the MCP-capability clarification below). (Refines the earlier pivot: the feature-card stays; a user-story subtask layer is inserted beneath it.)
- Q: How are task lines rendered, given the ClickUp MCP server exposes no checklist tool? → A: **As markdown checkbox lines (`- [ ] T001 …`) inside the US-subtask's markdown description**, not as native ClickUp checklist objects (the MCP server has no checklist API; per FR-023 all access is MCP-only). The sync rewrites the US-subtask description to add lines and flip boxes. Discovered during plan/research (2026-07-01); the term "checklist" throughout this spec means this markdown-checkbox rendering.

## User Scenarios & Testing *(mandatory)*

<!--
  These stories are written from the perspective of the people who use the Spec Kit
  workflow: the developer driving a feature, and the project lead / collaborators who
  watch progress in ClickUp. Each is independently testable against a real ClickUp
  workspace through the connected MCP server.

  MAPPING (post-pivot, refined): one Spec Kit FEATURE is one ClickUp TASK ("feature-card")
  in a single shared project list; each USER STORY is a SUBTASK under it (carrying native
  dependency links); each tasks.md line is a CHECKLIST ITEM inside its US-subtask. The
  card's status is derived from where the feature sits in the Spec Kit flow. Sync is
  strictly one-way: ClickUp is made to match the repo, never the reverse.
-->

### User Story 1 - See a feature as a rich, progressively-built card in ClickUp (Priority: P1)

A developer starts a feature — so far it has only a `spec.md`. They want it to appear in
ClickUp right away as a card carrying the feature's substance (summary, its user stories,
links to the artifacts), decomposed into its user-story slices with their dependencies
shown, and a status reflecting its stage — so the project lead sees the whole picture, not
just checkboxes, and not only once tasks are written. They run the sync; the shared list
shows one feature-card with a verbose body, a subtask per user story (with dependency links
where one story blocks another), and — once `tasks.md` exists — a checklist per user story.
As research, requirements, and tasks land, each sync enriches the same card. They mark
tasks done, re-sync, and the checklists and status update. They never touch the ClickUp UI
to set this up, and re-running never produces duplicates.

**Why this priority**: This is the entire point of the extension — mirroring a feature into
ClickUp as one legible, self-describing card that is useful at every stage, not just at the
end. Without it there is no feature. Materializing at spec time and enriching progressively
is what makes it useful for oversight throughout.

**Independent Test**: From a feature that has only `spec.md` and a provisioned shared list,
run the sync and confirm a feature-card exists with a body summarising the spec and its
user stories, one US-subtask per user story with dependency links matching the spec's
story ordering, and no checklist yet; then add `tasks.md`, re-sync, and confirm each
US-subtask gains a checklist with an item per task line matching checked/unchecked state,
with no duplicate card.

**Acceptance Scenarios**:

1. **Given** a feature with only `spec.md` and a provisioned shared list, **When** the sync runs, **Then** exactly one feature-card exists whose body summarises the spec and lists its user stories with links, with one US-subtask per user story and dependency links reflecting the spec's story ordering, and no checklist yet; the manifest records the card, US-subtask IDs, and a content hash.
2. **Given** that feature once `tasks.md` exists, **When** the sync runs, **Then** each US-subtask gains a checklist with one item per attributable `tasks.md` line (checked/unchecked matching the repo), lines not tied to a user story appear under a general checklist on the card, and no duplicate card or subtask is created.
3. **Given** a feature already synced, **When** the sync runs again with no artifact changes, **Then** no ClickUp write occurs and the run reports zero changes.
4. **Given** a feature already synced, **When** one task's done-state changes in `tasks.md`, **Then** only that one checklist item flips (and the card's derived status updates if a threshold is crossed), and nothing else changes.
5. **Given** a feature already synced, **When** the user-story ordering changes (a new blocks/waits-on relationship), **Then** the US-subtask dependency links are reconciled to match and no duplicate links remain.

---

### User Story 2 - Feature status tracks the Spec Kit stage automatically (Priority: P1)

The project lead wants the feature-card's status to answer "where is this?" without anyone
updating it by hand. As the feature moves through the Spec Kit flow, its ClickUp status
follows: a feature that has been specified but not yet planned reads **not-started**; once
implementation is underway it reads **in-progress**; once every task in `tasks.md` is
checked it reads **done**. The status is derived, not entered — the sync computes it from
observable repo state each run.

**Why this priority**: The derived status is what makes the card useful for oversight — a
checklist alone shows detail but not stage. Tying status to the flow the AI already runs
means it is always current and never depends on someone remembering to move a card. It is
co-equal with US1: the card and its status together are the MVP.

**Independent Test**: Take a feature at three points — spec only (no plan), mid-implement
(some tasks checked), and complete (all checked) — run the sync at each, and confirm the
card's status is not-started, in-progress, and done respectively, with no manual status
change in ClickUp.

**Acceptance Scenarios**:

1. **Given** a feature that has a spec but no plan yet, **When** the sync runs, **Then** the feature-card's status is not-started.
2. **Given** a feature whose implementation is underway (at least one task checked, not all), **When** the sync runs, **Then** the feature-card's status is in-progress.
3. **Given** a feature whose `tasks.md` tasks are all checked, **When** the sync runs, **Then** the feature-card's status is done.
4. **Given** the target list does not define statuses that can represent not-started / in-progress / done, **When** provisioning runs, **Then** it stops and tells the operator which statuses the list needs, rather than syncing to an unusable mapping.

---

### User Story 3 - Establish the shared ClickUp home once, early (Priority: P2)

Before feature-cards are pushed, the shared ClickUp list that will hold every feature's
card must exist, its status set must be able to represent the three derived states, and
that location must be known. A developer (or an automatic step after planning) provisions:
the extension ensures the configured Space exists, ensures the project's shared list
exists inside it, verifies the list's statuses can carry the not-started / in-progress /
done mapping, and records the target identifiers and the resolved status mapping so every
later sync run knows exactly where to write and which status means what — without
searching or guessing. If the list already exists, provisioning recognises and records it
rather than creating a duplicate.

**Why this priority**: Provisioning is a precondition for syncing, but it is a distinct,
infrequent responsibility. Separating it keeps the frequent sync cheap (it never has to
discover or create the list, or work out the status mapping) and gives one obvious place
to see and change where cards are pushed and how status is mapped. Because the list is
shared across features, provisioning is mostly a no-op after the first feature.

**Independent Test**: From a repo with no recorded ClickUp target, run provision and
confirm the manifest now records a workspace, space, shared-list identifier, and a
status mapping; run provision again and confirm no duplicate space or list is created and
the recorded identifiers and mapping are unchanged.

**Acceptance Scenarios**:

1. **Given** a configured target space name and no recorded ClickUp target, **When** provision runs against a list whose statuses support the mapping, **Then** the project's shared list exists under that space and the manifest records the workspace, space, list identifiers, and the status mapping.
2. **Given** the shared list already exists (provisioned by an earlier feature), **When** provision runs for a new feature, **Then** no new space or list is created and the recorded identifiers and status mapping are reused.
3. **Given** the configured target space does not yet exist, **When** provision runs, **Then** the space is created (or the operator is told it must be created) before the list, and the resulting identifiers are recorded.

---

### User Story 4 - Drop the extension into any repo and ship it to collaborators (Priority: P3)

Someone who is not the original author adds this extension to their own Spec-Kit-based
repo. They set the target space and shared-list name in a configuration placeholder, and
the extension works against their own ClickUp workspace. Nothing in the committed
extension carries the original author's account, space identifiers, or credentials. The
extension's package layout, command files, and hook registration match the other
extensions in the repo, so it is recognisable and maintainable.

**Why this priority**: Genericity and shippability make this a reusable extension rather
than a one-off script, but they are a quality attribute layered on top of the core
push-and-status; the feature delivers value to its author even before it is portable.

**Independent Test**: Inspect the committed extension and manifest for any literal
account-specific identifier or secret (there must be none); set only the configured space
and list name and run provision + sync in a different workspace, confirming it operates
against that workspace.

**Acceptance Scenarios**:

1. **Given** the committed extension files, **When** they are inspected, **Then** no ClickUp credential, account identifier, or pre-bound space/list identifier appears anywhere except the per-feature manifest produced at runtime.
2. **Given** a fresh repo with the extension installed and only the target space and list name configured, **When** provision and sync run, **Then** they operate against the configured workspace without further author-specific setup.
3. **Given** the extension package, **When** its structure is compared to the existing git-commit and taskstoissues extensions, **Then** it follows the same package layout, command-file convention, and hook-registration mechanism.

---

### User Story 5 - ClickUp conforms to the repo, never the other way (Priority: P2)

The project lead trusts the ClickUp board as a faithful mirror of the repo: a hand-edit in
ClickUp must not silently become the truth. So the sync always drives ClickUp *toward* the
repo — overwriting any drift on the ClickUp side for every element the extension owns — so
the repo stays the single source of truth.

**Why this priority**: This is what makes the mirror trustworthy for oversight. Without the
strict repo→ClickUp direction, the board could drift from the repo via hand-edits and the
"one-way, repo is truth" guarantee would be hollow. It sits just below the core card/status
stories because it protects their integrity.

**Independent Test**: Hand-edit a checklist item the extension created in ClickUp, re-sync,
and confirm it reverts to match the repo (the hand-edit does not propagate back into the repo).

**Acceptance Scenarios**:

1. **Given** a synced feature whose ClickUp card has been hand-edited on an element the extension owns, **When** the sync runs, **Then** that element is overwritten to match the repo and the hand-edit does not propagate back into the repo.

---

### Edge Cases

- **Shared list missing at sync time**: A sync runs when the manifest has no shared-list identifier (never provisioned). The sync must refuse with a clear instruction to provision first, rather than silently creating the list or writing to the wrong place.
- **Status set can't represent the mapping**: The target list's statuses cannot express not-started / in-progress / done. This is caught at **provision** time (US2 scenario 4 / US3 scenario 1): provisioning stops and tells the operator exactly which statuses to add, and records nothing until fixed. Sync never runs against an unusable mapping.
- **Task line removed from `tasks.md`**: A line that was previously synced no longer appears. Because lines are checklist items owned by their US-subtask, the sync removes the corresponding checklist item from that US-subtask (the repo is the source of truth for each subtask's checklist; this is not the same as deleting a whole tracked card). Removing a *feature* is handled below.
- **User story removed / renumbered**: A user story that had a US-subtask no longer exists in the spec. The sync MUST reconcile — leave no orphaned US-subtask silently. **v1 default: report the orphan in the run summary and leave it in place (do not delete)**, and re-point any dependency links accordingly. (Deleting orphaned subtasks is deferred; the v1 requirement is no silent drift.)
- **Feature card exists in ClickUp but its manifest is gone / card deleted in UI**: If the manifest references a feature-card that no longer exists in ClickUp, the sync recreates the card (with its US-subtasks and checklists) and refreshes the manifest rather than failing the run.
- **Two collaborators sync the same feature**: Because the manifest is committed, a second collaborator inherits the recorded feature-card ID and updates the same card rather than creating a parallel one. Concurrent runs that both create are a known race; the committed manifest is the mitigation, and last-writer-wins on the manifest is acceptable.
- **Malformed or empty `tasks.md`**: No recognisable task lines are found. The sync makes no ClickUp changes and reports that there was nothing to sync (it does not create an empty feature-card).
- **Shared list shared with non-spec tasks**: The configured list may already contain cards created by hand or by other tooling. The sync MUST only ever touch feature-cards it created (those recorded in a manifest); it MUST NOT modify or count unrelated cards in the shared list.
- **Human sets a richer status by hand**: Out of scope for this version (the backlog spec covers coexistence with human-owned states). This version derives and writes only not-started / in-progress / done; behaviour when a human has set some other status on the card is defined by the backlog spec, not here.

## Requirements *(mandatory)*

### Functional Requirements

#### Mapping & sync (US1)

- **FR-001**: The extension MUST mirror each Spec Kit feature as exactly one ClickUp task ("the feature-card") in the project's single shared ClickUp list; it MUST NOT create a separate list per feature and MUST NOT create a separate top-level ClickUp task per `tasks.md` line.
- **FR-002**: The extension MUST represent each of the feature's user stories as one **subtask** ("US-subtask") under the feature-card, titled from the user story (e.g. `US1 - <title>`), so the card decomposes into its independently-testable slices.
- **FR-002a**: The extension MUST represent each `tasks.md` line as one markdown checkbox line (`- [ ] T001 …`) inside the markdown description of the US-subtask of the user story it belongs to (falling back to a checkbox list in the feature-card's own description for lines not attributable to a user story, e.g. Setup/Polish), preserving the task identifier (e.g. `T001`) in the line text so a human and the sync can correlate the two. (The ClickUp MCP server exposes no native checklist API; the checkbox list lives in the task description. "Checklist" elsewhere in this spec refers to this rendering.)
- **FR-003**: The extension MUST reflect each `tasks.md` line's done-state (checked/unchecked) onto its corresponding markdown checkbox (rewriting the US-subtask description so the box matches the repo).
- **FR-004**: The extension MUST title the feature-card from the feature (e.g. its directory name / spec title) so it is identifiable in the shared list.
- **FR-004a**: The extension MUST populate the feature-card's description body from the feature's artifacts as they exist, in a verbose-but-bounded form: a spec summary, the list of user stories (with priorities), and pointers/links to the artifacts (spec, research, plan, tasks) — rather than copying those artifacts' full contents into ClickUp.
- **FR-005**: The sync MUST be idempotent: running it repeatedly with no change to the feature's artifacts MUST make no ClickUp modifications and MUST create no duplicate feature-card, US-subtasks, or checklist items.
- **FR-006**: On each sync run the extension MUST classify the feature-card, each US-subtask, and each checklist item (markdown checkbox line) as new (create), changed (update), or unchanged (skip) by comparing against the manifest, and MUST make no ClickUp write when nothing changed.
- **FR-007**: The sync MUST report a per-run summary of what it did (card created/updated/unchanged, US-subtasks added/updated, checklist items added/flipped/removed, dependencies set, body updated, status set).

#### Progressive materialization (US1)

- **FR-007a**: The extension MUST create the feature-card as soon as the feature has a `spec.md` (it MUST NOT wait for `tasks.md`); a feature with a spec but no tasks yet MUST still appear as a card (with body and status, and no checklist until tasks exist).
- **FR-007b**: On each sync run the extension MUST re-derive the feature-card body, US-subtasks, checklist, dependencies, and status from whatever artifacts currently exist, so the card grows richer as the feature advances (spec → research → requirements → tasks) without a separate command per stage.

#### User-story dependencies (US1)

- **FR-007c**: The extension MUST set native ClickUp dependency links between US-subtasks to reflect the ordering the feature encodes between user stories (e.g. US3 waits-on US1 and US2), so the dependency structure is represented as real, navigable ClickUp links rather than prose.
- **FR-007d**: When the user-story ordering changes in the repo, the sync MUST reconcile the US-subtask dependency links (add newly-required links, remove links no longer implied) rather than leaving stale ones.

#### Derived status (US2)

- **FR-008**: The extension MUST derive the feature-card's status from observable repo state, mapping to exactly three states in this version: **not-started** (a spec exists but no `plan.md` yet), **in-progress** (`plan.md` exists and not all tasks are checked — this includes the case where `tasks.md` exists with zero tasks checked), and **done** (`tasks.md` exists and all its tasks are checked). The single canonical rule: no plan → not-started; plan present but not all tasks done → in-progress; all tasks done → done.
- **FR-009**: The derived status MUST be computed on every sync run and written to the feature-card via the status mapping recorded at provision time.
- **FR-009a**: Each US-subtask MUST ALSO carry its own derived status, computed from that user story's own task completion and re-computed every sync: all of the story's tasks checked → done; some but not all → in-progress; none checked → not-started. (A US-subtask's status reflects its own progress, not the feature-card's — so a feature card can be in-progress while its finished stories read done.)
- **FR-010**: The extension MUST NOT require the target list to use any particular custom status names; it MUST map its three logical states onto statuses the list actually has, using the mapping resolved and recorded during provisioning.

#### Provisioning (US3)

- **FR-011**: The extension MUST provide a provisioning step, separate from sync, that ensures the configured space and the project's single shared list exist, and records their identifiers in the manifest.
- **FR-012**: Provisioning MUST verify the target list's statuses can represent not-started / in-progress / done and record the resulting status mapping; if they cannot, provisioning MUST stop and tell the operator which statuses the list needs, recording nothing until resolved.
- **FR-013**: Provisioning MUST be find-or-create: if the target space and/or shared list already exist (e.g. provisioned by an earlier feature), it MUST adopt and record them rather than create duplicates, and reuse the existing status mapping.
- **FR-014**: The sync MUST refuse to run (with a clear instruction to provision first) when the manifest has no recorded shared-list identifier or no status mapping, rather than create the list or guess a mapping itself.

#### Manifest (US1, US3)

- **FR-015**: The extension MUST persist per-feature sync state in a committed manifest file located within the feature's own directory.
- **FR-016**: The manifest MUST record the shared-list identifier, the status mapping, the feature-card's ClickUp identifier, each US-subtask's ClickUp identifier, and a content hash capturing the card body, US-subtasks, their dependency links, the checklist state, and the derived status.
- **FR-017**: The manifest MUST be the authoritative dedup index: the sync MUST determine create/update/skip from the manifest, not from re-scanning the shared list (which also holds other features' and unrelated cards).
- **FR-018**: When the manifest references a feature-card that no longer exists in ClickUp, the sync MUST recreate it (card + US-subtasks + checklists + dependency links) and refresh the manifest rather than fail the run.

#### Direction & scope (US5)

- **FR-019**: The synchronisation MUST be one-way (repo → ClickUp). The extension MUST NOT modify `tasks.md` or any repo artifact based on ClickUp state.
- **FR-019a**: The sync MUST make ClickUp match the repo, never the reverse: for every element it owns (card body, US-subtasks, dependency links, checklist items, status), the repo's current state is authoritative and ClickUp is overwritten to match. Any divergence found in ClickUp (e.g. a hand-edited checklist item the extension owns) MUST be corrected toward the repo, not merged back.
- **FR-020**: This version MUST derive and write only the three states in FR-008. It MUST NOT attempt the richer lifecycle (planning / review / testing), human-testing handoff, or a manual/one-off tracking mode — those are explicitly deferred to a separate backlog feature.

#### Genericity & shippability (US4)

- **FR-021**: The committed extension MUST NOT contain any ClickUp credential, secret, account identifier, or pre-bound space/list identifier; the only place runtime ClickUp identifiers appear is the per-feature manifest produced at runtime.
- **FR-022**: The target space and the shared list name MUST be selectable through a configuration placeholder that a new adopter fills in, with no code changes required to retarget the extension at a different workspace, space, or list.
- **FR-023**: All ClickUp operations MUST go through the connected ClickUp integration (MCP server); the extension MUST NOT implement its own ClickUp API client, authentication, or credential storage.
- **FR-024**: The extension MUST provide operator-invocable commands to provision and to sync, and MUST register them as optional lifecycle hooks: provisioning after planning, and sync after task generation and after implementation.
- **FR-025**: The extension MUST follow the same package structure, command-file convention, and hook-registration mechanism as the existing `.specify/extensions/` packages (git-commit is the structural exemplar; agent-context is a second reference), and MUST be installable/removable through the same extension mechanism without affecting other extensions.

#### Boundary (template hygiene)

- **FR-026**: The extension MUST live entirely within the spec-workflow scaffolding space (the extension and command directories and the per-feature manifest under the feature's spec folder) and MUST NOT introduce ClickUp references into shipped application source, shipped documentation, or build/CI files.

### Key Entities

- **Feature**: A Spec Kit feature (`specs/NNN-*`), the unit that is mirrored. It has a spec, optionally research/plan/tasks artifacts, user stories, and a stage in the Spec Kit flow. Mapped to one ClickUp feature-card. Materialized as soon as its `spec.md` exists.
- **User story**: An independently-testable slice of a feature (e.g. `US1`, priority P1), with an ordering relationship to other stories (some block others). Mapped to one US-subtask under the feature-card, carrying dependency links.
- **Task line**: A single line in a feature's `tasks.md`, identified by its task ID (e.g. `T001`), carrying a description and a done-state (checked/unchecked). Mapped to one markdown checkbox line inside the US-subtask description of the user story it belongs to (or the card's own description if unattributable).
- **Shared ClickUp list (per project)**: The single ClickUp list that holds one feature-card per feature in the repo. One per project, not one per feature.
- **Feature-card (ClickUp task)**: The mirror of one feature inside the shared list, carrying the feature title, a verbose body (spec summary + user stories + artifact links), a subtask per user story, and a derived status.
- **US-subtask (ClickUp subtask)**: The mirror of one user story under the feature-card. Its markdown description carries the checkbox list of the story's task lines; it carries native ClickUp dependency links to the other US-subtasks it waits on / blocks.
- **Card body**: The feature-card's description, synthesized each sync from the artifacts that exist — a spec summary, the user-story list with priorities, and pointers/links to the artifacts (not their full contents).
- **US dependency link**: A native ClickUp dependency between two US-subtasks, derived from the ordering the feature encodes between user stories.
- **Checklist item (markdown checkbox)**: The mirror of one `tasks.md` line as a `- [ ] T001 …` line inside its US-subtask's markdown description (or the card's own description for unattributable lines), carrying the line text (incl. task ID) and checked/unchecked state. Not a native ClickUp checklist object — the MCP server has no checklist API.
- **Derived status**: One of not-started / in-progress / done, computed each run from repo state and written to the feature-card via the recorded status mapping.
- **Status mapping**: The resolved correspondence between the three logical states and the target list's actual statuses, established and recorded at provision time.
- **Sync manifest (per feature)**: The committed record, stored in the feature's own directory, holding the target ClickUp identifiers (workspace, space, shared list), the status mapping, the feature-card ID, the US-subtask IDs and their dependency links, and a content hash. Serves as both the target locator and the dedup index, scoped to one feature.
- **Target configuration**: The adopter-supplied setting (a placeholder filled in per repo) naming the ClickUp space and shared list. Contains no secrets.
- **Extension package**: The installable unit (declaration, command files, optional scripts, hook registrations) that delivers provisioning and sync, parallel to the existing extensions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a single sync of a feature with M user stories and N tasks, the shared list contains exactly one feature-card for that feature, with exactly M US-subtasks and a total of N checklist items across them matching the repo's checked/unchecked state, and no card belonging to another feature is affected.
- **SC-002**: Re-running the sync with no artifact changes results in zero ClickUp writes (a true no-op), verifiable from the run's reported summary.
- **SC-003**: Changing exactly one task's done-state in `tasks.md` and re-syncing flips exactly one checklist item (and updates the card's status only if a threshold is crossed), leaving everything else unchanged.
- **SC-004**: A feature that has only `spec.md` (no `tasks.md` yet) syncs to a feature-card with a non-empty body and one US-subtask per user story — proving the card materializes and is verbose before tasks exist.
- **SC-005**: When the spec defines a story ordering (e.g. US3 depends on US1 and US2), the corresponding US-subtasks carry native ClickUp dependency links matching that ordering, and changing the ordering reconciles the links with no stale ones left.
- **SC-006**: The feature-card's status reads not-started before a plan exists, in-progress while implementing, and done once all tasks are checked — with no manual status change in ClickUp.
- **SC-007**: Provisioning against a list whose statuses cannot represent the three states stops with a clear message naming the needed statuses, and writes nothing to the manifest.
- **SC-008**: Provisioning a second feature creates no new space or list; it reuses and reports the shared-list identifiers and status mapping established by the first feature, and provisioning twice for the same feature creates nothing the second time.
- **SC-009**: A hand-edit in ClickUp to an element the extension owns (e.g. a checklist item it created) is reverted to match the repo on the next sync — confirming ClickUp conforms to the repo, never the reverse.
- **SC-010**: A person other than the author can install the extension, set only the target space and shared-list name, and successfully provision and sync against their own ClickUp workspace without editing any command or script file.
- **SC-011**: Inspection of every committed file in the extension finds zero ClickUp credentials, account identifiers, or pre-bound space/list identifiers.
- **SC-012**: With `specs/` and `.specify/` removed, no remaining shipped file references ClickUp — confirming the integration stays within spec-workflow scaffolding.

## Assumptions

- A ClickUp integration (MCP server) is already connected and authenticated in the environment where the commands run; the extension consumes it and does not manage credentials.
- The adopter has permission in their ClickUp workspace to create (or already has) the target space and to create the shared list, feature-cards, US-subtasks, dependency links, and checklist items within it.
- All features in one repo share a single ClickUp list; each feature is one card in it, distinguished by being its own card. The list's lifespan is the project's, not any one feature's.
- `tasks.md` follows the established Spec Kit convention: tasks are markdown checkbox lines whose IDs are `T` followed by three digits, as produced by `/speckit-tasks`. (Phase / user-story markers still exist in `tasks.md` but are not separately modelled in ClickUp in this version — they may be surfaced later.)
- The feature's stage is observable from repo state the Spec Kit flow already produces (presence of `plan.md`, `tasks.md`, and the checked/unchecked counts in `tasks.md`), which is what the derived status reads.
- The feature directory is the per-feature location already resolved by the Spec Kit flow (via `.specify/feature.json`), and the manifest lives alongside the other artifacts there.
- This extension is a template-level improvement to the Spec Kit scaffolding (the same tier as the existing extensions), not application logic; it ships with the template and is available to every app spun up from it, but the apps' shipped code does not depend on it.
- Versioning of this extension follows the repo's existing release-derivation conventions; as the fourth feature it lands under the `vX.4.x` minor line. The exact mechanism is a planning concern, not a spec requirement.
- The first version is push-and-status only: one-way, three derived states, no deletion of whole tracked feature-cards for a removed feature, no back-sync of status into the repo. The richer lifecycle, human-testing handoff, and manual/one-off light mode are deferred to a separate backlog feature.
