---
name: speckit-analyze-autofix
description: Apply the unambiguous fixes from the /speckit-analyze report, then re-present the analysis
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: snackbyte
  source: analyze-autofix:commands/speckit.analyze.autofix.md
---

# Analyze Auto-Fix

Run as the `after_analyze` hook. `/speckit-analyze` produces a **read-only**
findings report and never edits files. This skill takes those findings, applies
the ones with a single obvious fix, and re-presents the analysis so the only
thing left is work that genuinely needs the user.

## Inputs

- The findings table from the analysis that just ran (IDs, categories,
  severities, locations, recommendations). Use the report already in this
  conversation; do not re-derive from scratch unless it is missing.
- The feature artifacts: `spec.md`, `plan.md`, `tasks.md` in the active feature
  directory (resolve via `.specify/feature.json` /
  `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`).

## What counts as "unambiguous" (auto-fixable)

Apply a fix directly **only when there is a single obvious correct resolution**,
regardless of the finding's severity label. Typical cases:

- Terminology drift — normalize to the dominant/defined term across files.
- Unresolved placeholders (TODO, TKTK, ???, `<placeholder>`) where the intended
  content is obvious from surrounding context.
- Typos, formatting, broken cross-references, obviously stale paths.
- A task referencing a file/component that was clearly renamed elsewhere.
- A coverage gap where the missing task is mechanical and unambiguous (e.g. a
  requirement that plainly maps to one obvious task).
- De-duplicating two requirements that are word-for-word equivalent.

## What to STOP on (leave for the user)

Do **not** auto-apply when the resolution requires judgment or a product decision:

- Conflicting requirements where either could be the intended one (e.g. Next.js
  vs Vue) — the user must choose.
- Ambiguous vague criteria ("fast", "secure") where the measurable target is a
  product decision.
- Anything where two or more reasonable fixes exist and picking one changes scope
  or behavior.
- Constitution (MUST) conflicts whose resolution changes the design.

When unsure whether a fix is unambiguous, treat it as **needs attention** and do
not apply it.

## Procedure

1. **Confirm intent.** This hook is optional and prompts; the user opted in by
   running it. Proceed to fix.
2. **Partition** the findings into *Auto-fixable* and *Needs attention* using the
   criteria above.
3. **Apply** each auto-fixable fix with a targeted edit to the relevant artifact.
   Keep edits minimal and in the surrounding style. Track exactly what changed.
4. **Re-analyze.** Re-run `/speckit-analyze`'s checks (or re-invoke analyze) so
   the counts/IDs reflect the post-fix state.
5. **Re-present** a single consolidated report with two clearly separated
   sections:

   ```
   ## Analyze Auto-Fix Results

   ### Fixed automatically (N)
   | ID | Category | Severity | Location | What changed |

   ### Needs your attention (M)
   | ID | Category | Severity | Location | Why it needs you | Suggested resolution |
   ```

   End with the standard Next Actions block (e.g. resolve remaining CRITICAL/HIGH
   before `/speckit-implement`).

## Notes

- Only edit the feature's own artifacts (`spec.md`, `plan.md`, `tasks.md`). Do not
  touch unrelated files.
- If there were zero findings, report that and make no edits.
- Consider committing the artifact edits afterward (e.g. via the
  `speckit-git-commit` checkpoint) so the auto-fixes are captured — but only if
  the user wants a commit.
