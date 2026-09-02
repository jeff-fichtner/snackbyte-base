---
name: "speckit-engine-verify"
description: "Certify a completed feature: recursive code review + full unit gate + automatable E2E, then advance the card to in-review."
argument-hint: "(no arguments)"
compatibility: "Requires spec-kit project structure with .specify/ directory; the ClickUp plug is optional"
metadata:
  author: "snackbyte"
  source: ".specify/extensions/engine/commands/speckit.engine.verify.md"
user-invocable: true
disable-model-invocation: false
---

Execute the verify command. The authoritative command body lives at
`.specify/extensions/engine/commands/speckit.engine.verify.md` — read it and follow its steps
exactly.

Run after `/speckit-implement`. In order, stopping on the first failure: (1) recursive code review
via the review module with target `code`; (2) the full unit check gate (must pass); (3) whatever
E2E the AI can automate, reporting the rest; (4) only on success, set the `verifyPassed` marker and
sync the card to `in-review`. Produce an honest handoff (verified-automatically vs. remaining-manual
with evidence). Never advance to `in-review` over a red gate or an unresolved review finding —
leave the card at `in-development`.

## Done When

- [ ] The command body was read and followed step by step.
- [ ] Review + gate + E2E all ran; the card reached `in-review` ONLY if all passed (else it stayed
      `in-development` with the failure surfaced).
- [ ] A verified-vs-manual handoff was reported in the flow.
