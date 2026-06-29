# Research: Declarative N-Environment Manifest

**Phase 0 output.** All decisions below were resolved during an extended design discussion and the two
clarify sessions recorded in [spec.md](./spec.md) — there were **no open NEEDS CLARIFICATION items and
no research agents were dispatched**. This file consolidates the settled decisions in
Decision / Rationale / Alternatives form so the plan and contracts have a single reference.

---

## Decision 1: One declarative manifest; "production" is just a row (Model B)

**Decision**: Environments are a declared list in a single manifest. The production environment is the
row that is the public face; it is **not** a baked-in special case. The default manifest *describes*
`main → production` and `dev → staging` exactly, so the default path is byte-identical.

**Rationale**: The hard-coded pair was repeated by literal name in six places, each independently
assuming exactly two streams. A single source of truth removes that duplication and makes "add an
environment" a one-row edit. Making production "just a row" (not privileged in code) is what lets the
same code path serve any number of environments uniformly.

**Alternatives considered**: *Model A* — production baked into code, the manifest lists only the
"extra" environments. Rejected: it keeps production as a permanent special case, forcing two code
paths forever (the baked path + the manifest path), which is the opposite of the uniformity goal.

---

## Decision 2: Facets are orthogonal and cannot contradict → presets, not guardrails

**Decision**: The per-environment facets (`isPublicFace`, `noindex`, `tagSuffix`) are independent
single-purpose switches. No combination is invalid — only unusual. Environment "types"
(`production`, `staging`, `preview`) are convenience presets shipped as plain editable values, not an
enforced schema. No facet-coherence validation exists.

**Rationale**: Each facet maps to one mechanism (a header, a build constant, a tag suffix) with no
cross-facet rule, so incoherence is not representable. A validation layer would be dead weight
guarding against a state that cannot break. Names therefore carry zero enforcement weight — they are
human-readable handles, editable by anyone.

**Alternatives considered**: A closed type system that rejects "incoherent" environments. Rejected:
there is nothing to reject (facets can't contradict), so it would add machinery and friction for no
correctness gain. A name→behavior enforcement layer was rejected for the same reason — the name
carries no behavior, the facets do.

---

## Decision 3: Suffix-agnostic reuse — the one engine change

**Decision**: The derivation's reuse step changes from branch-specific ("reuse the *named opposite
stream's* tag on this commit") to **suffix-agnostic** ("reuse *any* version number already tagged on
this commit, else advance to the global-max patch + 1"), then stamp *this* environment's suffix
(looked up from the manifest by branch). The branch name is used only as data; no per-environment
code path exists.

**Rationale**: With exactly two streams, "the other stream" is unambiguous and the branch-specific
regex happened to work. With N environments "the other stream" is no longer a single thing, but
Invariant 1 guarantees there is only ever **one** number on a commit — so "reuse whatever number is
here" is unambiguous for any N. This single change generalizes versioning to N environments,
topology-independently (a `qa → staging → prod` chain behaves identically to `qa → prod`).

**Invariants preserved (proven)**:
- *Invariant 1 — no two distinct commits share a number.* A number is minted exactly once (first env
  to touch a never-tagged commit takes max+1); every other tag bearing that number is created only by
  the reuse branch, which fires only when a tag is already on the *same* commit. So all tags with a
  given number point at the same commit.
- *Invariant 2 — promotion reuses, never mints.* Promotion fast-forwards one env's branch to another's
  commit; that commit already carries a number, so the reuse branch fires.

**Alternatives considered**: Keep the branch-specific reuse and add a per-environment arm for each new
environment. Rejected: it is `if env == X` branching that grows with environment count and forces a
per-environment test, the exact scaling this feature removes. A "which sibling to prefer" rule for 3+
streams was rejected because it is unnecessary — there is only ever one number on a commit.

---

## Decision 4: `mintsVersions` is not a facet

**Decision**: There is no `mintsVersions` facet. Every environment runs the same reuse-or-mint routine:
it mints when it is the first to touch a fresh commit and reuses when a number is already there.

**Rationale**: Under suffix-agnostic reuse, no environment "never mints" — staging mints `-dev` numbers
on fresh dev commits in the normal flow, and a later promotion reuses them. A `mintsVersions` flag
would describe a distinction that does not exist in the logic.

**Alternatives considered**: Modeling a "prod mints / non-prod reuses" split as a facet. Rejected: it
misdescribes the behavior (all envs mint-or-reuse by commit) and would add a useless field.

---

## Decision 5: Tag format = parameterized parts; parser generated from the parts

**Decision**: The tag is `<prefix><MM>.<patch><suffix>` — prefix and per-environment suffix are the
parameterized parts. The parser that reads numbers back is **derived from the same parts**, so render
and parse cannot drift. The `MAJOR.MINOR.PATCH` integer-patch numbering is fixed.

**Rationale**: The derivation is bidirectional — it both writes tags and parses every existing tag to
find the global max. A free-form format template gives the write direction but not a safe read
direction; the two could disagree and silently mis-derive. Generating the parser from the same parts
makes drift impossible while still allowing prefix/suffix customization (the realistic variation).

**Alternatives considered**: A fully general render+parse regex codec the app supplies. Rejected:
round-trip drift risk, the need for a `parse(render(n)) === n` validator, and the constraint that the
parsed value must remain a single monotonic integer — a constrained freedom easy to violate. Exotic
schemes (calver, number-in-the-middle) are a **fork** of the ~80-line `derive-version.sh`, not a
config knob. The common variation is a config part; the radical variation is a fork.

---

## Decision 6: Environment identity is build-time and immutable (like a serial number)

**Decision**: The environment an artifact belongs to is decided at build, baked into both the frontend
bundle and the compiled server, and never changed afterward. The runtime `APP_ENV` is removed as a
*source of truth* (at most a pass-through of the baked value). The build learns its environment from a
single `APP_ENV_NAME` build-arg and resolves that name's facets against `environments.json` **at build
time** (facets are not passed as separate pre-resolved build-args).

**Rationale**: A label you can relabel at deploy time is not provenance. Because every environment
builds its own image (staging builds `-dev`, prod builds clean), the old "same image, different env via
a runtime var" premise is dead — the runtime var is vestigial. Baking the identity makes frontend and
server agree by construction and makes rollback coherent (a rolled-back image truthfully reports the
env it was built for). Passing only the *name* keeps the manifest the single source of truth at build
time (facets can't drift into build-args), with a one-argument build-arg surface.

**Alternatives considered**: (a) Keep runtime `APP_ENV` as the env source — rejected (mutable label,
frontend/server can disagree, frankenstate possible). (b) Pass all facets pre-resolved as separate
build-args — rejected (duplicates manifest data into args that can drift). (c) Resolve facets in CI
into a generated identity module — rejected (adds a codegen step and a derived file).

---

## Decision 7: A typed `env` accessor for app code (server + frontend); `local` fallback

**Decision**: Expose a small typed environment object (`name`, `isPublicFace`, `is(<name>)`) to app
code on both the server and the frontend, fed by the baked identity. When no identity was baked (local
`npm run dev`, un-built test contexts), fall back to a hard-coded constant identity named **`local`**
(not public face, no-indexed) — **not** a manifest row.

**Rationale**: "Show X in environment Y" becomes ordinary app code branching on a trustworthy constant,
removing any need for a feature-flag system. The accessor reads the baked value so server and frontend
cannot disagree. `local` is named to avoid collision with the `dev` branch and to be honest that it
means "running locally / no deployment," not "the development environment." It is a constant rather than
a row because the manifest lists only *deployable* environments (each with a branch, each
buildable/taggable); a non-deployable phantom row would pollute the branch-lookup and derivation.

**Alternatives considered**: (a) A feature-flag system — rejected (over-built; env-awareness is what is
actually needed). (b) `development` as the fallback name — rejected (whiff of being an environment, one
letter off the `dev` branch). (c) `local` as a real manifest row — rejected (introduces a
non-deployable phantom into branch/derivation logic). A `debug` diagnostic facet was considered and
**deferred** (no consumer today; diagnostic posture is orthogonal to identity and the extensible facet
vocabulary can absorb it later).

---

## Decision 8: Wildcard workflow trigger + a `resolve-env` short-circuit

**Decision**: The CI workflow triggers on `push` with `branches-ignore` for obvious noise
(`feature/**`, `dependabot/**`, …) and a lightweight **`resolve-env`** first job that reads the
manifest, looks up the pushed branch, and short-circuits (clean exit, no tag/deploy) if it is not an
environment — gating the expensive jobs via `needs`/`if`. The pull-request merge gate is unaffected.

**Rationale**: GitHub evaluates `on: push: branches:[...]` **before** any checkout, so the trigger is
the one consumer that cannot read the manifest at decision time. A wildcard + in-job lookup is the only
option where adding an environment touches **only** the manifest. The cost is a rare ~2-second no-op
runner on a stray non-env push; the real release path (PR merge to an env branch) and the PR gate are
unchanged. `resolve-env` does a shallow checkout + manifest read only, so the no-op never runs `npm ci`
or the full build.

**Alternatives considered**: (a) *Codegen* the literal branch list from the manifest — rejected
(introduces a derived file + a drift-check; adding an env needs a regenerate step). (b) *Hand-edit* the
trigger list — rejected (a second manual edit with a silent-failure mode if forgotten: the env never
triggers). Both relocate the hard-coded env list into the YAML, the pattern this feature removes.

---

## Decision 9: `environments.json` as plain JSON at the repo root; shared `node -p` read

**Decision** *(Clarify session round 1)*: The manifest is a single root-level `environments.json`. Node
consumers read it natively (a small typed `src/environments.ts` wrapper); the shell derivation reads it
via the existing `node -p` pattern (the same mechanism `derive-version.sh` already uses for
`package.json`).

**Rationale**: JSON has no parser ambiguity in either Node or shell and needs no new dependency. A
standalone root file is the most legible "one place to edit" and diffs cleanly as environments change.

**Alternatives considered**: (a) An `environments` field inside `package.json` — rejected (couples
release config to the package manifest). (b) A `.ts`/`.mjs` module — rejected (the shell derivation
cannot import TypeScript without a compile/shim step).

---

## Decision 10: Manifest validation stays permissive (warn, don't block)

**Decision** *(Clarify session round 2)*: No facet-coherence validation (incoherence is not
representable). Two environments sharing a tag suffix emits a **non-blocking warning** (a legibility
footgun, not a correctness error). The only hard failure in the manifest path is an **unknown branch**
at derivation time.

**Rationale**: Suffix sharing cannot corrupt the version line (distinct numbers keep tags distinct), so
it is a legibility issue, not an error — a warning informs without contradicting "names carry zero
enforcement." An unknown branch, by contrast, means the derivation cannot know which suffix to stamp,
so it must fail loudly.

**Alternatives considered**: (a) Fully silent — rejected (leaves the one real footgun undetectable).
(b) Reject duplicate suffixes — rejected (contradicts the permissive, no-enforcement stance).

---

## Decision 11: Manifest ships final; the resolver does not touch it

**Decision** *(Clarify session round 2)*: `environments.json` is **not part of spin-up automation**. It
ships final with the default two environments, identical in the template and in every freshly-spun app;
`init.mjs` does not read, seed, or rewrite it. Editing it is an ordinary by-hand post-spin-up action.

**Rationale**: The default manifest is app-agnostic (branches + facets, no app name or deploy
coordinates), so there is nothing per-app for the resolver to substitute. Keeping `init.mjs` out of it
minimizes resolver surface (Principle II) and makes the manifest the same trustworthy artifact
everywhere — including for the template repo's own derivation.

**Alternatives considered**: (a) The resolver seeds/rewrites it — rejected (resolver logic for no
per-app gain). (b) The template ships without a manifest and the resolver creates it — rejected (the
template's own CI/derivation would then lack a manifest).

---

## Decision 12: Upgrade path is documented manual diffs, not a script

**Decision**: Apps initialized before this change upgrade via a **documented manual path** — exact,
copy-pasteable diffs to introduce the manifest (seeded with the app's current two environments) and
rewire the four de-hardcoded spots. No automated upgrade script.

**Rationale**: Matches the template's "apps re-spin, not migrate" stance while giving an in-flight app a
real, reviewable path. A script would be maintenance surface for a one-time, rarely-needed operation;
nothing is in production use that warrants automated in-place migration.

**Alternatives considered**: (a) An `upgrade-environments.mjs` script — rejected (maintenance cost for a
rare op; re-spin is the primary path). (b) Doc-only with no per-file diffs — rejected (too vague to be
actionable for an app mid-flight).
