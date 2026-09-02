---
name: "speckit-clickup-sync"
description: "Make the active feature's ClickUp card (body, US-subtasks, checklist, dependencies, status) match the repo; idempotent, one-way."
argument-hint: "(no arguments)"
compatibility: "Requires spec-kit project structure with .specify/ directory and the ClickUp MCP server connected"
metadata:
  author: "snackbyte"
  source: ".specify/extensions/clickup/commands/speckit.clickup.sync.md"
user-invocable: true
disable-model-invocation: false
---

Execute the ClickUp sync command. The authoritative command body lives at
`.specify/extensions/clickup/commands/speckit.clickup.sync.md` — read it and follow its
steps exactly.

Make the feature's ClickUp representation match the committed repo: one feature-card in the
shared list, a subtask per user story (with dependency links and a markdown checkbox list of
its task lines), a verbose description body, and a derived status. **One-way** (repo →
ClickUp), **idempotent** (a no-op run makes zero ClickUp writes), **MCP-only**. The card
materializes as soon as `spec.md` exists and is enriched on every run.

## Steps

1. Read the full command body at
   `.specify/extensions/clickup/commands/speckit.clickup.sync.md`.
2. Follow it verbatim: refuse (and point the user to `/speckit-clickup-provision`) unless the
   manifest has `listId` + `statusMapping`; derive body / US-subtasks / checkbox-lists / deps /
   status via the `clickup-*.sh` helpers; hash each element canonically; diff against the
   manifest; and create/update via the ClickUp MCP tools, skipping unchanged elements with zero
   MCP calls.
3. Enforce one-way overwrite (repo is authoritative; hand-edits in ClickUp revert), progressive
   materialization (card at spec-only, no empty-checklist noise), and the orphaned-US-subtask
   rule (report + leave in place, re-point deps — do NOT delete).

## Done When

- [ ] The command body was read and followed step by step.
- [ ] The feature-card, US-subtasks, checklists, dependencies, and statuses match the repo (or
      the run refused with a clear reason).
- [ ] A per-run created/updated/unchanged/orphaned summary was reported to the user.
