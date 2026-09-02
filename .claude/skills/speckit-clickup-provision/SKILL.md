---
name: "speckit-clickup-provision"
description: "Find-or-create the ClickUp space + shared list and record the target IDs and status mapping in the active feature's manifest."
argument-hint: "(no arguments)"
compatibility: "Requires spec-kit project structure with .specify/ directory and the ClickUp MCP server connected"
metadata:
  author: "snackbyte"
  source: ".specify/extensions/clickup/commands/speckit.clickup.provision.md"
user-invocable: true
disable-model-invocation: false
---

Execute the ClickUp provision command. The authoritative command body lives at
`.specify/extensions/clickup/commands/speckit.clickup.provision.md` — read it and follow
its steps exactly.

Ensure the ClickUp target for this repo exists and record where it is, so later `sync` runs
never have to discover or guess. Provisioning is separate from and earlier than sync; it is a
near-no-op after the first feature (the shared list is reused). All ClickUp access is through
the connected ClickUp MCP server — no API/auth code.

## Steps

1. Read the full command body at
   `.specify/extensions/clickup/commands/speckit.clickup.provision.md`.
2. Resolve config first (placeholder → ask → remember): if `config.yml` has `enabled: false`,
   silently no-op (the user already declined — never re-ask). If `space`/`list` are still
   `<...>` placeholders, ask the user **once** for the space/list; save real values they give
   (never ask again), or write `enabled: false` if they decline.
3. Then follow the command verbatim: resolve the active feature and manifest, locate the space
   via `clickup_get_workspace_hierarchy`, find-or-create the shared list, resolve the
   `not-started`/`in-progress`/`done` status mapping from `clickup_get_list`, and write the
   targets into the feature manifest via `manifest.sh set-targets`.
4. Fail loud (stop, write nothing) on a missing/ambiguous space or a list whose statuses cannot
   represent the three logical states distinctly — naming exactly what is missing.

## Done When

- [ ] The command body was read and followed step by step.
- [ ] The feature manifest has `listId` + `statusMapping` (or the run stopped with a clear,
      named reason and wrote nothing).
- [ ] What happened (space found, list found-or-created, resolved mapping — or the stop-reason)
      was reported to the user.
