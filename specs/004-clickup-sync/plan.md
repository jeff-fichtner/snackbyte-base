# Implementation Plan: ClickUp Task Sync Extension

**Branch**: `004-clickup-sync` | **Date**: 2026-07-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-clickup-sync/spec.md`

## Summary

Deliver a Spec Kit **extension** that mirrors each feature into ClickUp as one
feature-card (a ClickUp task) in a single shared project list, with a US-subtask per
user story (carrying native dependency links), a checklist per US-subtask mirroring the
`tasks.md` lines, a verbose description body synthesized from the feature's artifacts, and
a status derived from the feature's Spec Kit stage (not-started / in-progress / done).
Sync is strictly one-way (repo → ClickUp; ClickUp is overwritten toward the repo, never
merged back) and idempotent, backed by a committed per-feature manifest that is both the
target locator and the dedup index. Provisioning is a separate, earlier step that
find-or-creates the space + shared list and pins the status mapping. All ClickUp operations
go through the connected ClickUp MCP server — no custom API/auth code. The package mirrors the
existing `git-commit` extension's structure and registers as optional lifecycle hooks.

**Technical approach**: This is spec-workflow scaffolding, not application code. The
"implementation" is a self-contained extension package under `.specify/extensions/clickup-sync/`
— an `extension.yml` declaration, agent-driven command prompts (`.md`) that call ClickUp MCP
tools, thin bash helpers for repo-side parsing/manifest I/O, mirrored `.claude/skills/*/SKILL.md`
entries, and hook rows in `.specify/extensions.yml`. It ships with the template and is
available to every spun-up app, but no shipped app code depends on it (Constitution III/VIII).

## Technical Context

**Language/Version**: Bash (POSIX-ish, matching existing `.specify` scripts) for repo-side
helpers; Markdown command prompts executed by the coding agent; YAML for the extension and
hook declarations. No compiled language and no Node runtime dependency for the extension
itself (the template's Node tooling is unrelated).

**Primary Dependencies**: The connected **ClickUp MCP server** (tools prefixed
`clickup_*` — e.g. `clickup_get_workspace_hierarchy`, `clickup_create_list`,
`clickup_create_task`, `clickup_update_task`, `clickup_get_task`,
`clickup_add_task_dependency`, `clickup_remove_task_dependency`, `clickup_get_list`,
`clickup_get_custom_fields`). The core `.specify/scripts/bash/common.sh` helpers
(`get_feature_paths`, `has_jq`, `json_escape`, `get_repo_root`). `jq` when available, with a
documented no-jq fallback (matching the existing scripts' pattern).

**Storage**: One committed JSON manifest per feature at `specs/<feature>/.clickup-sync.json`
(the dedup index + target locator). One committed, secret-free config placeholder at
`.specify/extensions/clickup-sync/config.yml` (target space + shared-list name). No database.

**Testing**: Follows the template's local-gate model (`npm run check:all` +
`npm run test:release`) — the extension's bash helpers get shell-level tests in the same
style as `scripts/derive-version.test.sh` / `add-env.test.sh` (pure parsing/manifest logic,
no live ClickUp calls). ClickUp-touching behavior is validated manually via the quickstart
against a real workspace (the MCP server is not available in headless CI).

**Target Platform**: Developer workstation running the Spec Kit flow with the ClickUp MCP
server connected. Not deployed anywhere; not exercised by app CI.

**Project Type**: Spec Kit **extension package** (parallel to `git-commit`), living entirely
in spec-workflow scaffolding space.

**Performance Goals**: A no-op sync (no artifact change) MUST make zero ClickUp writes
(SC-002). A single-task change MUST touch exactly one checklist item (SC-003). The manifest
is the dedup index so unchanged elements incur no ClickUp read/write — "run as often as
possible" is met by making the common case cheap.

**Constraints**: One-way only (never write to the repo from ClickUp; FR-019). No secrets or
account/space/list IDs committed except runtime IDs in the per-feature manifest (FR-021,
SC-012). All ClickUp access via MCP only (FR-023). Idempotent + fail-loud on missing
provisioning or unusable status set (FR-011/012/014). Must not add ClickUp references to
shipped app source/docs/CI (FR-026, SC-013).

**Scale/Scope**: Tens of features per repo; each feature-card has a handful of US-subtasks
and up to a few dozen checklist items. A shared list may also hold unrelated human/tooling
cards the extension must never touch (edge case).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The snackbyte-base constitution governs the **template**. This feature is a template
improvement (an extension), so the relevant principles are the scaffolding-boundary ones.

| Principle | Assessment | Verdict |
|---|---|---|
| **III. Skeleton Only — No Application Logic** | The extension is spec-workflow tooling, the same tier as the existing `git-commit`/`agent-context` extensions. It ships no app domain logic; nothing in `src/`/`tests/` gains ClickUp behavior. FR-026 + SC-013 assert this. | PASS |
| **VIII. Speckit Stays in Speckit Spaces** | Everything lives under `.specify/` and `.claude/` plus per-feature manifests under `specs/<feature>/`. Shipped source/docs/CI stay ClickUp-free; SC-013 verifies "delete specs/ + .specify/ ⇒ no ClickUp references remain." | PASS |
| **IV. Two-Tier Propagation (Template vs Package)** | This is a skeleton/tooling concern (a spec-flow extension), correctly in the template tier that propagates by template copy — not shared UI. | PASS |
| **II. Convention Over Configuration** | The package mirrors the established extension layout (extension.yml + commands/ + scripts/bash/), reuses `common.sh` helpers, and the manifest lives by convention alongside other feature artifacts. | PASS |
| **VII. Pinned, Linted, Type-Safe, Tested** | Bash helpers get shell tests in the existing style and pass `check:all` (prettier over `.md`/`.json`/`.yml`, shell hygiene). No new runtime deps. | PASS |

**Result: PASS, no violations.** Complexity Tracking left empty.

One boundary note carried into design: the extension's *own* files necessarily contain the
string "ClickUp" — that is allowed (they live in scaffolding space). The prohibition is on
ClickUp leaking into **shipped** app source/docs/CI, which SC-013 checks by construction.

## Project Structure

### Documentation (this feature)

```text
specs/004-clickup-sync/
├── plan.md              # This file
├── research.md          # Phase 0 output — MCP tool mapping, status-derivation, dep model, no-jq
├── data-model.md        # Phase 1 output — manifest schema, config schema, entity→ClickUp map
├── quickstart.md        # Phase 1 output — provision + sync against a real workspace
├── contracts/           # Phase 1 output — command contracts + manifest/config JSON-shape contracts
│   ├── provision.command.md
│   ├── sync.command.md
│   ├── manifest.schema.md
│   └── config.schema.md
├── checklists/
│   └── requirements.md  # (already present from specify/clarify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

The delivered artifact is an extension package plus its skill mirrors and hook wiring:

```text
.specify/
├── extensions/
│   └── clickup-sync/
│       ├── extension.yml                       # package declaration (schema_version 1.0)
│       ├── config.yml                          # secret-free placeholder: space + shared-list name
│       ├── README.md                           # what it is, how to configure, what it touches
│       ├── commands/
│       │   ├── speckit.clickup.provision.md     # find-or-create space+list, pin status mapping
│       │   └── speckit.clickup.sync.md          # derive+diff+push card/US-subtasks/checklist/status
│       └── scripts/bash/
│           ├── clickup-manifest.sh              # read/merge/write specs/<feature>/.clickup-sync.json
│           ├── clickup-parse-tasks.sh           # parse tasks.md → US-grouped lines + done-state + hash
│           └── clickup-derive-status.sh         # repo state → not-started/in-progress/done
├── extensions.yml                              # add: installed[] + hooks rows (after_plan/after_tasks/
│                                               #      after_implement)
.claude/skills/
├── speckit-clickup-provision/SKILL.md          # mirror of the provision command (user-invocable)
└── speckit-clickup-sync/SKILL.md               # mirror of the sync command

# Per-feature runtime artifact (created by the extension at runtime, committed by the author):
specs/<feature>/.clickup-sync.json
```

**Structure Decision**: Mirror the **git-commit extension** package layout exactly
(`extension.yml` + `commands/*.md` + `scripts/bash/*.sh`, with a `.claude/skills/*/SKILL.md`
mirror per command) because it is the proven in-repo convention and Constitution II mandates
convention over novelty. Two commands: provision + sync. Bash
helpers hold all repo-side logic (parsing, hashing, manifest I/O) so the command
prompts stay thin and the deterministic parts are shell-testable; the prompts own only the
ClickUp MCP orchestration, which cannot be unit-tested headlessly.

## Complexity Tracking

> No Constitution violations — this section intentionally left empty.
