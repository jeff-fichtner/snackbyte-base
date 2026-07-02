# Backlog: Post-Implement Handoff — Test-Everything, ClickUp Lifecycle, Human Testing & Manual Mode

**Status**: Backlog (not yet specified — do NOT run `/speckit-specify` here until 004 ships)

**Depends on**: `004-clickup-sync` (the base push-and-status extension) for the ClickUp
scope (§1–3). The test-and-handoff scope (§0) is independent of ClickUp and could be
specified first, but is parked here because it is the _other_ half of "everything the AI
should do once implementation happens" and shares the same `after_implement` hook slot.

**Why this is a separate spec**: During 004's clarify pass (2026-07-01) the mapping was
pivoted (feature → ClickUp task, `tasks.md` line → checklist item, status derived from the
Spec Kit flow). That pivot surfaced a richer set of desires that would have stalled 004 if
folded in. They are parked here so 004 stays thin and shippable. See the 004 spec's
Clarifications section and the memory note `spec004-clickup-mapping-pivot`.

The **test-and-handoff** scope (§0) was added later: the desire for a single codified
"here is everything the AI must do, start to finish, after implement lands" hook — exhaustive
automated testing (unit, then E2E as far as is technically possible) followed by an honest
handoff report of what was verified vs. what remains for the human. It belongs here because
it is the same lifecycle moment (`after_implement`) as the ClickUp status/handoff work.

---

## Scope this backlog captures

### 0. Post-implement test-everything + handoff hook (the "finish the job" gate)

A codified `after_implement` extension that runs **after** `/speckit-implement` completes and
encodes, as a repeatable command, the discipline of _doing literally everything the AI can to
verify a feature before handing it to a human_, then reporting honestly. Today that discipline
lives only as a global instruction; this feature makes it a first-class, per-feature Spec Kit
step so it runs the same way every time.

Two phases, in order:

**A. Exhaustive automated testing — unit first, then E2E as far as technically possible.**

- **Unit / per-component, as-you-go closure:** ensure the feature's units have tests and the
  full project check gate is green — for this template that is `npm run check:all` +
  `npm run test:release`, plus any feature-specific shell tests (the `*.test.sh` pattern used
  by `derive-version.test.sh`, `add-env.test.sh`, the new `clickup-*.test.sh`). Fail loud on
  a red gate; do not proceed to handoff over failing tests.
- **End-to-end, as far as automatable:** do not stop at "this needs a live environment." Drive
  the real path as far as the available tooling allows — apply migrations, seed and clean up
  test data, invoke the real inputs (CLI/APIs/MCP), deploy to a non-prod target if that is what
  it takes, hit real endpoints, and read back real results. For _this_ template that means, at
  minimum, exercising the spun-up app's real deploy/version/env flow rather than only its unit
  tests; for a spec that touches ClickUp it means a real MCP round-trip against a scratch space.
- **Irreducible manual slice:** identify and clearly delimit only the genuinely un-automatable
  remainder (a visual/UX confirmation, a human-in-the-loop approval, a credential only the human
  holds) — and say _why_ each could not be automated.

**B. General handoff / report.** Produce a consistent end-of-feature handoff summarizing:
what the feature does and where it lives; what was verified automatically (with evidence —
test counts, gate output, endpoint/log rows, MCP results) vs. what remains manual and why; any
follow-ups, known gaps, or backlog items surfaced during implementation; and the exact manual
steps left for the human. This is the "start-to-finish, here is everything the AI did and what
is left" artifact.

**C. Close-out (the missing terminal step).** A feature is not *done* when
`/speckit-implement` finishes — it is done when the last tasks (often a manual verification the
AI cannot run) are signed off. Today the lifecycle **ends at `after_implement`** (implement →
git-commit → clickup-sync → converge), which fires *before* those manual tasks are checked. So
nothing in the flow: (a) surfaces the remaining manual tasks for human sign-off, (b) marks them
done in `tasks.md` once signed off, (c) runs the **final sync** to move the ClickUp card to
done/shipped, or (d) **commits** the close-out. During 004's own dogfood these four steps had to
be done by hand, out of the normal flow — exactly the gap this phase closes.

Close-out therefore encodes, as a repeatable command, the terminal ceremony:

- Confirm all non-manual tasks are complete; **surface any manual/human-in-the-loop tasks and
  wait for explicit sign-off** — never silently check them.
- On sign-off, mark those tasks done in `tasks.md`.
- Run the **final clickup-sync** so ClickUp reflects the now-complete state (card + subtasks →
  done/shipped) — reusing the one-way sync, not duplicating it.
- **Commit** the close-out edits (the git-commit hook fired at implement time, *before* these
  edits existed, so a fresh commit is required — sync itself must never commit, per 004 FR-019).
- Emit the handoff report (phase B) as the closing artifact.

This makes "commit vs. sync vs. close" a single ordered ceremony a normal agent runs, instead
of three decoupled acts whose ordering is only guaranteed if a human drives them.

**Open questions to resolve when specifying:**

- Is this one command (test-then-handoff) or two composable hooks (`after_implement` test gate,
  then a separate handoff report)? Leaning: one orchestrating command with two internal phases,
  mirroring how `git-commit`/`clickup-sync` are single commands.
- Where does the handoff report land — stdout only, a committed `specs/<feature>/HANDOFF.md`,
  the ClickUp card body (ties into §1–3), or all three?
- How does the E2E phase stay _generic_ across spun-up apps that differ wildly in what "E2E"
  means, without hardcoding app specifics into the template? (Likely: a declared, per-app
  `e2e` hook/script the extension invokes if present, else a documented no-op with a loud note.)
- What is the failure contract — does a red gate block the handoff, block the `after_implement`
  chain (which currently continues into `converge`), or just annotate the report?
- Interaction with `converge`: `converge` already runs `after_implement` to append unbuilt work
  as tasks. Does test-everything run before or after converge, and does converge-added work
  re-open the test gate?
- **Close-out trigger**: close-out happens *later* than `after_implement` (after human sign-off
  of manual tasks), so it likely can't be an `after_implement` hook — it is probably a distinct
  user-invoked command (`/speckit-close` or similar) run when the human is ready, OR a new
  lifecycle point. Which? And does it re-run the phase-A gate first (verify still green) before
  marking done + syncing + committing?
- **Commit inside close-out**: close-out must commit (the implement-time git-commit hook already
  ran, before the close-out edits). Does it reuse the existing `git-commit` extension, or commit
  directly? Either way, sync must stay non-committing (004 FR-019).

**Why:** codifies the standing testing-discipline rule as a deterministic step so every feature
gets the same exhaustive pre-handoff treatment instead of relying on the instruction being
remembered. See the global "Testing Discipline (HARD RULE)" and "do E2E before handing to me."

> **§1–3 below are the ClickUp lifecycle scope** — they depend on 004 and are distinct
> from §0. §0 (test-everything + handoff) does not depend on ClickUp and can be specified
> independently; the only overlap is §0's optional choice to write its handoff into the
> ClickUp card body.

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

### 4. Agent-designed, project-specific ClickUp rules (expand beyond the baked-in defaults)

004 ships **basic rules baked in**: feature → card, user story → subtask, `tasks.md` line →
checkbox, and a fixed 3-state status mapping (not-started / in-progress / done) resolved onto
whatever statuses the list happens to have. Every project gets the same default shape. This
track lets the **agent actively design a ClickUp ruleset tailored to the specific project**,
turning the fixed default into a starting point that can be expanded per repo.

The idea: instead of one hardcoded mapping, an agent step inspects the project (its real
ClickUp space/list workflow and statuses, its spec conventions, how the team actually tracks
work) and **proposes/generates a project-specific rule set** — which lifecycle states to use
and how they map, whether phases/user-stories become tags vs. subtasks vs. lists, what the card
body should emphasize, custom-field usage, etc. — recorded as config the sync then honors. The
baked-in defaults remain the fallback; this is opt-in enrichment.

**Open questions to resolve when specifying:**
- What is the boundary between "baked-in defaults" (always present, need no design step) and
  "designed rules" (agent-generated, per project)? The defaults must keep working untouched.
- Where do designed rules live — an expanded `config.yml` schema, a separate
  `clickup-rules.yml`, or the manifest? How are they versioned and re-generated when the
  project's ClickUp workflow changes?
- How much does the agent decide vs. propose-for-approval? (Designing rules that reshape a
  team's board is high-impact — likely propose + confirm, not silent auto-apply.)
- Interaction with §1 (lifecycle): the richer status set is itself one kind of "designed rule";
  this track generalizes it from status to the whole mapping.
- Ties back to the ClickUp read tools already available (`get_workspace_hierarchy`,
  `get_list`, `get_custom_fields`) — the agent designs *from* the real workspace shape.

**Why:** the one-size default is a deliberate v1 simplification; real projects have their own
ClickUp conventions, and an agent that designs rules to fit them makes the extension adapt to
the project instead of forcing the project to adapt to the extension.

### 5. Link GitHub commits/PRs to ClickUp cards

004 pushes card/subtask/checklist/status but no code-provenance — you cannot see, from a
ClickUp card, which commits or PRs implemented the feature. This track links them so the card
shows the work that delivered it. There are two mechanisms with different cost, and both stay
consistent with 004's one-way rule (repo → ClickUp); capture both, decide when specifying.

**Option A — MCP-pushed by our extension.** The sync reads the feature's git history
(`git log` over the feature's commits) and attaches it to the card via the ClickUp MCP server —
as a card comment, a links section in the body, or task links. Pure one-way, no GitHub remote or
ClickUp-side configuration required; we build and own it; fits 004's model directly. Limitation:
whatever we render is static text/links, not ClickUp's live commit/PR UI.

**Option B — ClickUp's native GitHub integration.** Connect the repo in ClickUp and embed the
ClickUp task ID in commit/branch/PR messages (e.g. `CU-<taskid>`), so ClickUp auto-links commits,
branches, and PRs on the card with its rich first-party UI (maintained by ClickUp, effectively
bidirectional in the UI). Our extension's contribution is making the task ID available and
documenting the commit-message convention. Requires a GitHub remote and the message convention.

**The ordering snag (applies mostly to B, but worth noting for both):** the commit that finishes
a feature usually cannot contain the ClickUp task ID, because the card is created by **sync,
which runs after implement commits** — so at commit time the task ID may not exist yet. Same
"hooks fire in an order" theme as the close-out gap (§0). Solvable — provision could create the
card earlier so the ID exists before commits, or a later sync/close-out could back-fill the
links — but it is a real design question, not a given.

**Open questions to resolve when specifying:**

- A vs. B (or both)? A is self-contained and matches 004; B is richer but needs a remote +
  message convention + solving the ordering snag.
- If B: where does the task ID come from at commit time, given the card is created post-implement?
  (Create the card earlier at provision? Back-fill links on close-out/next sync?)
- If A: commit → card as a comment, a body section, or task links? How much history — just the
  feature's commits, or PRs too (needs a remote)?
- Does this run in the normal sync, or as part of close-out (§0 Phase C), where the final commit
  and the finished card both exist?

**Why:** a card that shows its implementing commits/PRs closes the loop between the tracker and
the code — the reviewer sees not just "what/why" (spec/tasks) but "what actually shipped it."

---

## Non-goals for this backlog (stay deferred or belong elsewhere)

- Two-way sync of task content back into `tasks.md` — still out of scope (repo remains the
  source of truth for spec-driven work).
- Any change to 004's core mapping (feature=card, line=checklist item) — this feature
  builds ON that, it does not revisit it.
- Building the actual test/E2E logic for any _specific_ spun-up app inside this template —
  §0 defines the generic hook and the per-app extension point, not app-specific tests.

## When ready to specify

Two independently-specifiable tracks live here; split them into their own feature dirs when
specifying rather than forcing one spec to carry both:

- **§0 — test-everything + handoff hook.** Independent of ClickUp; can be specified first
  (does not wait on 004). Draw the description from §0 above and the global Testing
  Discipline rule.
- **§1–3 — ClickUp lifecycle / human-testing / manual mode.** Specify only once `004` is
  merged and proven. Let the pivot memory (`spec004-clickup-mapping-pivot`) and the 004 spec
  inform plan/clarify.

Run the normal flow (`/speckit-specify`) from a feature dir per track — do NOT run it in this
backlog dir directly.
