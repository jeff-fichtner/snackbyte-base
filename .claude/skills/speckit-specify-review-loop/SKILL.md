---
name: speckit-specify-review-loop
description: Recursively review the new spec for inconsistencies and fix the unambiguous ones until clean or blocked on the user
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: snackbyte
  source: specify-review-loop:commands/speckit.specify.review-loop.md
---

# Specify Review Loop

Run as the `after_specify` hook. Recursively review the freshly written `spec.md`,
fixing the **unambiguous** problems each pass, and **stop** when either nothing
fixable remains or an issue needs the user's direct attention.

## Target

The active feature's `spec.md` (resolve the feature directory via
`.specify/feature.json` or
`.specify/scripts/bash/check-prerequisites.sh --json`). At the specify stage only
the spec normally exists — review the spec in isolation (do not require plan.md or
tasks.md). If the constitution exists
(`.specify/memory/constitution.md`), check alignment against it.

## What to review each pass

- **Internal consistency** — requirements that contradict each other; terminology
  drift (same concept named differently); entities referenced but never defined.
- **Ambiguity** — vague adjectives (fast, scalable, secure, intuitive, robust)
  with no measurable criteria; unresolved placeholders (TODO, TKTK, ???,
  `<placeholder>`).
- **Underspecification** — requirements with a verb but no object/measurable
  outcome; user stories missing acceptance criteria.
- **Structure** — missing mandated spec sections; malformed/duplicated headings.
- **Constitution alignment** — anything conflicting with a MUST principle.

## Auto-fix vs. stop (same bar as the rest of the toolkit)

- **Fix automatically** — any issue with a **single obvious correct resolution**,
  regardless of severity: normalize terminology, fill obvious placeholders, repair
  structure/formatting, tighten a requirement whose intended meaning is clear from
  context, de-duplicate word-for-word repeats.
- **Stop and surface to the user** — anything needing a product decision or with
  more than one reasonable resolution: conflicting requirements where either could
  be intended, a vague target whose measurable value is a business choice, a MUST
  conflict whose fix changes scope, or genuinely missing information only the user
  has. When unsure, treat it as needs-attention.

## The loop

1. **Pass.** Review `spec.md` against the checklist above. Collect findings.
2. **Apply** all auto-fixable findings with minimal, in-style edits.
3. **Decide termination.** Stop the loop when **either**:
   - the most recent pass produced **no new unambiguous fixes**, OR
   - the only remaining findings are **needs-attention** (user decisions).
   Otherwise go back to step 1 on the now-updated spec.
4. **Bound it.** Cap at a small number of passes (e.g. 5). If you hit the cap,
   stop and report — never loop indefinitely. Each pass must make progress or be
   the last; do not re-fix the same thing twice (that signals a non-fix — surface
   it instead).

## Report

End with:

```
## Specify Review Loop

Passes run: N

### Fixed automatically
- <file:section> — <what changed>   (one line each; or "none")

### Needs your attention
- <file:section> — <the issue> — <why it needs you / options>   (or "none — spec is clean")
```

Then hand off to clarify: this loop runs as the first `after_specify` step, and
`/speckit-clarify` auto-fires immediately after it. So end by noting that clarify
will now run to resolve remaining ambiguity — list any **Needs your attention**
items so clarify (and the user) can focus on them. Do not suggest `/speckit-plan`
here; clarify comes first in the chain.

## Notes

- Only edit the feature's `spec.md`. Do not touch unrelated files, plan.md, or
  tasks.md (they usually don't exist yet at this stage).
- This hook is **mandatory** in `.specify/extensions.yml` (`optional: false`): it
  auto-fires after `/speckit-specify`, and is ordered (priority 5) to run
  **before** the chained `/speckit-clarify` (priority 20) — "recursively review
  THEN clarify".
- The `agent-context` `after_specify` hook (priority 10) sits between them but
  only prompts; it does not block the review→clarify sequence.
