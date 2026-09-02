---
name: "speckit-clickup-design-rules"
description: "Inspect the real ClickUp workspace and propose a project-specific sync ruleset for approval; honored by sync when approved, else defaults apply."
argument-hint: "(no arguments)"
compatibility: "Requires spec-kit project structure with .specify/ directory and the ClickUp MCP server connected"
metadata:
  author: "snackbyte"
  source: ".specify/extensions/clickup/commands/speckit.clickup.design-rules.md"
user-invocable: true
disable-model-invocation: false
---

Execute the ClickUp design-rules command. The authoritative command body lives at
`.specify/extensions/clickup/commands/speckit.clickup.design-rules.md` — read it and follow its
steps exactly.

Inspect the real ClickUp workspace (statuses, custom fields, board shape) via the ClickUp MCP read
tools, then **propose** a project-specific sync ruleset (six-state status mapping, US→subtask/tag/list
choice, card-body emphasis, custom-field usage) for **explicit human approval**. On approval, record
it as config the sync honors; with no ruleset, the baked-in defaults apply unchanged. Reject any rule
that would violate a constitution principle (e.g. two-way sync). Never silently reshape the board.

## Done When

- [ ] The command body was read and followed step by step.
- [ ] A ruleset was proposed and only applied after explicit approval (or defaults left untouched).
- [ ] No constitution-violating rule was honored.
