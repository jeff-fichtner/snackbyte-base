---
name: speckit-git-commit
description: Stage and commit the current feature's Spec Kit artifacts as a pre-implementation checkpoint
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: snackbyte
  source: git-commit:commands/speckit.git.commit.md
---

# Commit Spec Artifacts

Capture the current feature's Spec Kit planning state in git history before
implementation begins. Stages **only** the feature's spec directory
(`specs/<feature>/`: `spec.md`, `plan.md`, `tasks.md`, `research.md`,
`data-model.md`, `contracts/`, checklists, …) and commits it as a clean
checkpoint, leaving any unrelated working-tree changes untouched.

## Behavior

The script resolves the active feature directory via the core
`get_feature_paths()` helper (honoring `SPECIFY_FEATURE_DIRECTORY` and
`.specify/feature.json`), then:

- Stages only `specs/<feature>/`.
- Exits successfully as a no-op when nothing under that directory is dirty — it
  never creates an empty commit.
- Otherwise commits with the message
  `chore(spec): checkpoint <feature> artifacts before implement` (override with
  `--message`).

This skill is registered as an **optional** `before_implement` hook in
`.specify/extensions.yml`, so `/speckit-implement` surfaces it and prompts
before running.

## Execution

- **Bash**: `.specify/extensions/git-commit/scripts/bash/commit-spec-artifacts.sh [--json] [--message "msg"]`

Run from anywhere inside the repo. Add `--json` for machine-readable output
(`{"status": "...", "message": "..."}`, where status is `committed`,
`nothing-to-commit`, or `error`).
