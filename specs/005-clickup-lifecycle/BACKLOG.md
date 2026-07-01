# Backlog: ClickUp Lifecycle, Human Testing & Manual Mode

**Status**: Backlog (not yet specified — do NOT run `/speckit-specify` here until 004 ships)

**Depends on**: `004-clickup-sync` (the base push-and-status extension). This feature
extends 004; it should not be started until 004's feature-card + derived-status model
exists and is proven.

**Why this is a separate spec**: During 004's clarify pass (2026-07-01) the mapping was
pivoted (feature → ClickUp task, `tasks.md` line → checklist item, status derived from the
Spec Kit flow). That pivot surfaced a richer set of desires that would have stalled 004 if
folded in. They are parked here so 004 stays thin and shippable. See the 004 spec's
Clarifications section and the memory note `spec004-clickup-mapping-pivot`.

---

## Scope this backlog captures

### 1. Full status lifecycle (beyond the three derived states)

004 derives only **not-started / in-progress / done**. This feature expands to the fuller
lifecycle the user wants to grow into — e.g.:

```
open/not-started → planning → implementing/in-progress → review → testing → done
```

with room for even more states later (the user mentioned lists that may have ~7 states;
004 "uses 3 for now"). Several of these states map naturally onto Spec Kit stages the flow
already moves through (specify → plan → tasks → implement → review), so part of this work
is deciding which states are **derivable from repo/flow state** vs. which require an
external signal.

**Open questions to resolve when specifying:**
- Which lifecycle states are auto-derivable from Spec Kit artifacts, and which are not?
- How are non-derivable states (review, testing) entered — and by whom?
- How does the mapping degrade when a target list has fewer statuses than the full set?

### 2. Human-testing handoff

The "review" and "testing" states involve a **person**, not the AI. This feature defines:
- Who moves the card into/out of human-testing states, and how the sync learns of it.
- The coexistence rule: one-way sync must own only the states it derives and MUST NOT
  overwrite a human-set status (e.g. a person marks "blocked" or "in QA" and the next sync
  must not reset it). This is the key correctness constraint 004 explicitly deferred.
- Whether a human sign-off is required before a feature can read "done".

### 3. Manual / one-off light mode

For work the user does **themselves**, outside the full Spec Kit pipeline, there is no
automated flow signal to derive status from. This feature defines a **lighter** tracking
mode for that case:
- What a manually-tracked item is (a card with no backing `tasks.md`? a hand-maintained
  checklist?).
- How its status is set (manual only) and how the sync avoids clobbering it.
- Whether manual items share the same shared list as spec-driven feature-cards, and how
  the two are told apart.

---

## Non-goals for this backlog (stay deferred or belong elsewhere)

- Two-way sync of task content back into `tasks.md` — still out of scope (repo remains the
  source of truth for spec-driven work).
- Any change to 004's core mapping (feature=card, line=checklist item) — this feature
  builds ON that, it does not revisit it.

## When ready to specify

Run the normal flow from this directory once 004 is merged and proven:
`/speckit-specify` with a description drawn from the three scope sections above, then let
the pivot memory and the 004 spec inform plan/clarify.
