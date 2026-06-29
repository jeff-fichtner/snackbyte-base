# Contract: Version Derivation (N environments)

The behavior every push's tag derivation MUST satisfy, and the **behavior-complete** scenario matrix
that is its test oracle. This contract is verified by `scripts/derive-version.test.sh` (run via
`test:release`) and by a fresh-app spin-up.

The input is the pushing **branch**; the manifest (`environments.json`) maps that branch to its
environment's `tagSuffix`. The output is a single git tag, created and pushed (no commit, no branch
push). `package.json` supplies MAJOR.MINOR; the PATCH is derived.

---

## The rule (one shared routine for every environment)

Given the pushing branch `B`:

1. **Resolve `B` against the manifest.** If `B` is not an environment branch → **hard error** (no tag).
   Otherwise read its `suffix = tagSuffix`.
2. **Reuse step (suffix-agnostic).** If **any** version number is already tagged on `HEAD` — regardless
   of which environment's suffix it bears — take that number as `patch`.
3. **Mint step.** Otherwise `patch = (global max patch among all v<MM>.* tags) + 1` (empty set ⇒ `0`).
4. **Stamp.** `tag = <prefix><MM>.<patch><suffix>`.
5. **Collision guard.** If `tag` already exists → **hard error** (no overwrite, no silent reuse); the
   dependent deploy is skipped.
6. Create and push the tag only. Never commit, never push a branch.

The branch is used **only** as data (the suffix lookup). There is **no per-environment code path** —
no `if branch == X`. The reuse regex matches any `v<MM>.<patch>` with any suffix or none.

---

## Invariants (MUST hold by construction, for any N environments and any topology)

- **I1 — No two distinct commits share a number.** A number is minted exactly once (the first env to
  touch a never-tagged commit). Every other tag with that number is created only by the reuse step,
  which fires only when a tag is already on the *same* commit. ⇒ all tags with a given number point at
  one commit.
- **I2 — Promotion reuses, never mints.** Promotion fast-forwards one env's branch to another's commit;
  that commit already carries a number ⇒ reuse fires ⇒ same number, the promoting env's suffix.
- **I3 — Suffixes are legibility, not correctness.** Two environments MAY share a suffix; it cannot
  corrupt the version line (distinct numbers keep tag strings distinct). Sharing emits a non-blocking
  **warning** only.
- **I4 — Gaps are correct.** A hotfix on one branch consumes a number; another env's next mint skips
  ahead. Gaps in an environment's sequence are expected for a global build id.
- **I5 — Shallow refusal.** A shallow checkout (tags possibly hidden) → **hard error** rather than a
  mis-derived number.

---

## Tag format (parameterized parts)

`tag = <prefix><MM>.<patch><suffix>`

- `prefix` and per-environment `suffix` are the parameterized parts.
- The **read-back parser** (used in the reuse and mint steps to turn existing tags into numbers) MUST
  be generated from the same `prefix`/`suffix` parts, so render and parse cannot drift.
- `MM.PATCH` integer numbering is fixed. Exotic schemes (calver, number-in-the-middle) are a **fork**
  of `derive-version.sh`, not a config option.

---

## Behavior-complete scenario matrix (the test oracle — FR-024)

**Normative rule for the matrix: it is sized by distinct *behaviors*, not by environment count.**
Adding an environment to an app MUST NOT add a scenario. Scenarios use environments as **stand-ins**
to exercise a behavior; they do not enumerate per-environment or per-pair cases. A new environment
runs the identical code path an existing stand-in already covers.

Each row below states a behavior, a setup, and the expected outcome. Stand-in environments: a
public-face env `P` (suffix `""`, on a `main`-like branch) and non-public envs `A` (suffix `-a`), `C`
(suffix `-c`) on their own branches — used only to exercise behaviors, not to enumerate environments.

| # | Behavior | Setup | Expected |
|---|---|---|---|
| B1 | **Mint — first ever** | no tags; push `P` | `v<MM>.0` |
| B1' | **Mint — first ever, non-public** | no tags; push `A` | `v<MM>.0-a` |
| B2 | **Mint — global-max advance** | `v<MM>.0` exists; push `P` on a fresh commit | `v<MM>.1` |
| B3 | **Mint — advance over mixed suffixes** | `v<MM>.0`, `v<MM>.1-a` exist; push `A` on a fresh commit | `v<MM>.2-a` (max is suffix-agnostic) |
| B4 | **Reuse — number already on HEAD (promotion)** | a commit carries `v<MM>.2-a`; push `P` on that commit | `v<MM>.2` (suffix dropped, number reused) |
| B5 | **Reuse — opposite direction (resync)** | a commit carries `v<MM>.5` (public); push `A` on that commit | `v<MM>.5-a` |
| B6 | **Reuse — three envs, one commit, one number** | a commit carries `v<MM>.4`; push `A` then `C` on that same commit | `v<MM>.4-a` then `v<MM>.4-c` — both reuse `4`; no second number minted |
| B7 | **Collision guard** | the target tag already exists on HEAD; re-derive | **hard error**, no tag |
| B8 | **Resume after promotion (no jam)** | a commit carries both `v<MM>.2-a` and `v<MM>.2`; push `P` on a *new* commit (nothing tagged on it) | `v<MM>.3` (advance, no jam) |
| B9 | **Hotfix gap** | several public numbers consumed (`v<MM>.5..8`); push `A` on a fresh commit | `v<MM>.9-a` (skips past the consumed numbers) |
| B10 | **Diverged merge gets a fresh number** | two diverged tagged commits merged by a 2-parent untagged merge commit; push `P` on the merge | advance to a fresh number (the merge artifact is distinct) |
| B11 | **Unknown branch** | push a branch not in the manifest | **hard error**, no tag |
| B12 | **Shallow refusal** | shallow checkout (tags hidden); derive | **hard error**, no tag |
| B13 | **Single-environment app** | manifest has only `P`; consecutive `P` pushes on fresh commits | `v<MM>.0`, `v<MM>.1` (self-increments; no sibling needed) |

**What this matrix deliberately does NOT contain**: a row per environment, or per environment-pair.
B6 proves "any N envs on one commit share a number" with three stand-ins — it covers N=3..∞ because the
logic is identical past the first reuse. There is no B6-for-four-environments.

**Key behavior coverage vs. the old (enumeration) suite**: B1/B1' (mint), B2/B3 (advance,
suffix-agnostic), B4/B5/B6 (reuse incl. multi-env), B7 (collision), B8 (resume/no-jam), B9 (gap), B10
(merge), B11 (unknown branch — **new**, replaces the old hard-coded `main`/`dev`-only acceptance), B12
(shallow), B13 (single-env). The old suite's `main`/`dev`-named rows collapse into these behavior rows
with environment stand-ins.

---

## Consumers of this contract

- `scripts/derive-version.sh` — implements the rule; reuse step suffix-agnostic; suffix + branch
  validity from the manifest via `node -p`; warns on duplicate suffix.
- `scripts/derive-version.test.sh` — implements this matrix, behavior-complete; fixtures use stand-in
  environments, not the literal `main`/`dev` enumeration.
- The CI `version-and-tag` job — runs the derivation after `resolve-env` confirms an environment branch.
