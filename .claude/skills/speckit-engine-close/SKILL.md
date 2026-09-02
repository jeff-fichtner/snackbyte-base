---
name: "speckit-engine-close"
description: "Terminal close-out: re-run the gate, surface manual tasks for sign-off, mark done, final sync, commit."
argument-hint: "(no arguments)"
compatibility: "Requires spec-kit project structure with .specify/ directory; the ClickUp plug is optional"
metadata:
  author: "snackbyte"
  source: ".specify/extensions/engine/commands/speckit.engine.close.md"
user-invocable: true
disable-model-invocation: false
---

Execute the close-out command. The authoritative command body lives at
`.specify/extensions/engine/commands/speckit.engine.close.md` — read it and follow its steps exactly.

Run when the human is ready to close a verified feature. In order: (1) re-run the check gate
(red → refuse); (2) confirm non-manual tasks complete; (3) surface the remaining manual tasks and
**wait for explicit sign-off** (never auto-check); (4) on sign-off, mark them done in `tasks.md` and
set the `closedOut` marker; (5) final sync so the card reaches `done` (the sync never commits);
(6) commit the close-out edits as a distinct commit (reuse the git-commit module); (7) emit the
closing handoff. The human signs off in the flow, never by editing the tracker.

## Done When

- [ ] The command body was read and followed step by step.
- [ ] Manual tasks were surfaced and only checked after explicit sign-off; the card reached `done`.
- [ ] The close-out edits were committed as a distinct commit; the sync step made no commit.
