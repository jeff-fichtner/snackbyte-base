# Feature Specification: Declarative N-Environment Manifest

**Feature Branch**: `003-env-manifest` (feature dir; work proceeds on `main` per the 001/002 convention)

**Created**: 2026-06-29

**Status**: Draft

**Input**: Generalize the hard-coded `main → production` / `dev → staging` mapping into a declarative,
customizable, expandable environment model — while keeping the two-environment default byte-identical.

## Context & Intent *(non-normative, read first)*

Today the template hard-codes **exactly two** environments. The pair `main → production` and
`dev → staging` is repeated, by literal name, in six places: the version-derivation script
(`scripts/derive-version.sh`), the CI workflow triggers, `cloudbuild.yaml`, the deploy job's
branch→env logic, the `noindex` check in `src/server.ts`, and `DEPLOY.md`. Each spot independently
assumes there are two streams and names them. Adding a third environment (a `qa`, a `preview`, a
client-specific staging) is therefore not a one-line change — it is an edit scattered across the
release tooling, easy to get partially wrong.

This feature replaces that scattered assumption with **one declarative environments manifest** — a
single source of truth that lists the environments an app has. Each environment is one row carrying
its branch, its name, and its per-environment facets. Every place that today hard-codes "two named
streams" instead **reads the manifest**. The default manifest *describes* `main → production` and
`dev → staging` exactly, so an app that never adds an environment behaves **byte-identically** to
today. Adding the Nth environment becomes: add a row, push the branch.

Five design facts shape everything below; they were resolved deliberately and are not re-opened here:

1. **Environments are a declared list; "production" is just a row.** There is no baked-in
   "production" special case — the production environment is simply the manifest row that is the
   *public face*. The default list reproduces today's behavior because it *describes* today, not
   because production is privileged in code.

2. **Per-environment facets are orthogonal and cannot contradict each other.** The switches an
   environment carries (is it the public face? should it be no-indexed? what tag suffix?) are
   independent single-purpose flags. No combination is *invalid* — only unusual. Consequently
   environment **types** (`production`, `staging`, `preview`) are convenience presets shipped as
   plain, editable config — **not** an enforced guardrail. No coherence-validation layer exists or
   is needed, because incoherence is not representable.

3. **Environment identity is build-time and immutable — baked into the image like a serial
   number.** Which environment an artifact belongs to is decided at build, baked into both the
   frontend bundle and the compiled server, and never changed afterward. A runtime variable as the
   *source of truth* for environment identity is removed: a label you can relabel at deploy time is
   not provenance. Because the identity is baked once, the frontend and the server can never
   disagree about which environment they are, and a rolled-back image still truthfully reports the
   environment it was built for.

4. **App code can ask "which environment am I?" through a typed accessor.** Both the server and the
   frontend expose a small typed environment object (its name, whether it is the public face, a
   convenience `is(<name>)` check), fed by the baked identity. "Show X only in environment Y"
   becomes ordinary application code branching on a trustworthy constant — there is no feature-flag
   system, and none is needed.

5. **The versioning engine does not change; only its reuse *lookup* generalizes.** Today the reuse
   step is branch-specific ("reuse the *named opposite stream's* tag if it is on this commit").
   It becomes suffix-agnostic: "reuse *whatever* version number is already tagged on this commit,
   else advance to the global-max patch + 1, then stamp *this* environment's suffix." This one
   change is the entire generalization to N environments. It is topology-independent (a
   `qa → staging → prod` promotion chain behaves identically to `qa → prod`), and it preserves both
   release invariants: no two distinct commits ever share a number, and a promotion reuses a number
   rather than minting a new one. The branch name becomes pure *data* — a key into the manifest for
   the suffix — and selects no code path: there is no `if env == "qa"` anywhere; one shared
   reuse-or-mint routine runs for every environment.

The change is **template-only**, and is a deliberate improvement to the template itself (the
explicitly-allowed case). A prerequisite rename (`APP_IS_PRODUCTION → APP_IS_PUBLIC_FACE`, the
build-time public-face flag) has already landed and is out of scope here. `specs/002-*` is left
untouched as the historical record of the two-environment design this supersedes.

## Clarifications

### Session 2026-06-29 (validation, resolver, fallback)

- Q: Should the tooling validate the manifest, or stay fully permissive → A: Warn, don't block. Two
  environments sharing a tag suffix emits a **non-blocking warning** (it is a legibility footgun, not
  a correctness error — distinct numbers keep tags distinct). An unknown branch at derive time keeps
  its existing **hard error**. No facet-coherence validation exists (incoherence is not
  representable). This honors "names carry zero enforcement" while surfacing the one real footgun.
- Q: Does the spin-up resolver (`init.mjs`) touch `environments.json` → A: No — the manifest is **not
  part of spin-up automation**. It ships final with the default two environments, identical in the
  template and in every freshly-spun app; `init.mjs` does not read, seed, or rewrite it. After
  inheriting the app, editing the manifest (to add or change environments) is an ordinary by-hand
  post-spin-up action, not a resolver step and not a spin-up decision.
- Q: Is the no-build fallback identity a manifest row or a constant, and what is it called → A: A
  hard-coded **constant** named **`local`**, NOT a manifest row. The manifest lists only *deployable*
  environments (each has a driving branch and is built/tagged/deployed); the fallback is the
  identity for a build with **no baked provenance** — local `npm run dev` or any context that ran
  outside a pipeline build. Naming it `local` (not `development`) avoids collision with the `dev`
  branch and is honest that it means "running locally, no deployment," not "the development
  environment." It carries safe non-public defaults (not public face, no-indexed). The branch-lookup
  and derivation never see it (it is not a row), so no phantom non-deployable environment pollutes
  that logic. A separate `debug` diagnostic facet was considered and deferred (no consumer today; the
  extensible facet vocabulary can absorb it later) — diagnostic posture is orthogonal to identity.

### Session 2026-06-29

- Q: Manifest file location & format → A: A root-level `environments.json` — standalone JSON, read
  by Node natively and by the shell derivation via the existing `node -p` pattern (the same way
  `derive-version.sh` already reads `package.json`); no new dependency, no parser ambiguity in
  either world.
- Q: How the build learns which environment it is building for → A: CI/deploy passes only the
  environment **name** as a single build-arg; the build resolves that name against `environments.json`
  to obtain the facets. The manifest stays the single source of truth at build time (facets are never
  duplicated into build-args that could drift), and the new build-arg surface is one argument.
- Q: Does the manifest also drive the per-environment deploy target (service name / host) → A: No —
  the manifest is **facet-only** (name, branch, public-face, noindex, tag suffix). The deploy job's
  branch→service/host mapping stays per-app documented code. Deploy coordinates are genuinely
  per-app (project, host, service-naming convention) and keeping them out of the shipped manifest
  preserves "skeleton ships no app-specific infra." FR-004's "adding an env touches only the
  manifest" scopes to the template's reusable half (versioning, chip, noindex, baked identity).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The two-environment default is byte-identical (Priority: P1)

A maintainer spins up an app and never touches the environments manifest. The app ships with exactly
the `main → production` / `dev → staging` behavior it has today: production builds with the chip
hidden and no `noindex`, staging builds with the chip shown and `noindex`, the derived tags are
`v<MM>.<patch>` and `v<MM>.<patch>-dev`, and promotion `dev → main` reuses the number. Nothing about
the release flow, the deployed artifacts, or `/api/version` differs from the pre-feature template.

**Why this priority**: This is the non-negotiable safety property. The whole point of the feature is
expandability *without* disturbing the proven default. If the default path changes in any observable
way, the feature has failed regardless of how good the expansion story is. Most apps will live
entirely on this path.

**Independent Test**: With the default manifest in place, derive tags across the acceptance matrix and
build both the production-default and staging-style images; confirm the derived tags, the chip
visibility, the `noindex` header, and the reported environment all match the pre-feature behavior
exactly. The release-tooling test suite (`test:release`) passes unchanged in intent.

**Acceptance Scenarios**:

1. **Given** the default manifest (two rows: production on `main`, staging on `dev`), **When** a push
   to `main` is processed, **Then** the derived tag is `v<MM>.<patch>` (no suffix) and the production
   image hides the chip and emits no `noindex` — identical to today.
2. **Given** the default manifest, **When** a push to `dev` is processed, **Then** the derived tag is
   `v<MM>.<patch>-dev`, the staging image shows the chip, and the served response carries
   `X-Robots-Tag: noindex` — identical to today.
3. **Given** the default manifest, **When** `dev` is promoted to `main` by fast-forward, **Then** the
   production tag reuses the staging number (the same commit carries both `v<MM>.<patch>-dev` and
   `v<MM>.<patch>`), with no new number minted — identical to today.

---

### User Story 2 - Add an Nth environment by adding one manifest row (Priority: P2)

A maintainer wants a third environment — say `qa`, deployed off a `qa` branch, no-indexed, chip
shown. They add one row to the manifest (branch `qa`, name `qa`, public-face false, noindex true, a
`-qa` tag suffix) and push the `qa` branch. The release flow recognizes `qa` as an environment: it
derives a `v<MM>.<patch>-qa` tag, builds an image whose baked identity is `qa`, deploys it
no-indexed with the chip shown, and `/api/version` reports `qa`. No other file is edited to make this
work — not the derivation script, not the workflow triggers, not the server, not the deploy config.

**Why this priority**: This is the feature's reason for existing. It must be demonstrably true that
adding an environment touches only the manifest, or the "uniform, expandable" promise is hollow.

**Independent Test**: Starting from a default app, add a single `qa` row to the manifest and push a
`qa` branch in a test fixture; confirm a `-qa` tag is derived, the built image reports `qa` from both
the frontend accessor and `/api/version`, and the served response is no-indexed — all without editing
any file other than the manifest.

**Acceptance Scenarios**:

1. **Given** a manifest with a third `qa` row, **When** the `qa` branch is pushed, **Then** the
   workflow treats `qa` as an environment and derives a `v<MM>.<patch>-qa` tag.
2. **Given** the `qa` row sets public-face false and noindex true, **When** the `qa` image is built
   and served, **Then** the chip is shown and the response carries `X-Robots-Tag: noindex`.
3. **Given** three environments share one commit (e.g. a commit tagged for `production`, `staging`,
   and `qa`), **When** each is derived, **Then** all three reuse the *same* patch number with their
   own suffixes — no environment mints a second number for that commit.
4. **Given** a push to a branch that is **not** in the manifest, **When** the workflow runs, **Then**
   it short-circuits cleanly: no tag is derived and no deploy occurs.

---

### User Story 3 - App code branches on the current environment (Priority: P3)

A developer writing application code wants a banner shown only on non-public environments, or a
feature visible only on `qa`. They read the typed environment accessor (`env.name`,
`env.isPublicFace`, `env.is('qa')`) — the same value on the server and in the frontend — and branch on
it. The value is the environment the image was built for; it is correct and consistent in both
render contexts, with no risk of the frontend and server disagreeing.

**Why this priority**: This is the payoff that turns the manifest from release plumbing into
something application code uses. It is lower priority than the release behavior because an app can
ship without ever reading it, but it is the seam that removes any temptation to build a parallel
feature-flag mechanism.

**Independent Test**: In both a server context and a prerendered/hydrated frontend context, read the
accessor for a known build and confirm it reports the environment the image was built for, identically
in both contexts; confirm a local `npm run dev` (no build-arg) reports the constant `local` fallback.

**Acceptance Scenarios**:

1. **Given** an image built for `staging`, **When** app code on the server reads the accessor and app
   code in the frontend reads the accessor, **Then** both report `staging` (they cannot disagree).
2. **Given** a local dev run with no environment build-arg, **When** the accessor is read, **Then** it
   reports the constant `local` fallback rather than erroring or reporting a stale value.
3. **Given** an image rolled back to a prior revision, **When** the accessor is read, **Then** it
   reports the environment that prior image was built for (identity travels with the artifact).

---

### User Story 4 - Upgrade an app initialized before this change (Priority: P4)

A maintainer has an app spun up from the *previous* template — it has the hard-coded two-environment
files. They follow a documented manual upgrade: add the manifest (seeded with their app's current two
environments) and apply the listed edits to the four de-hardcoded spots. After the upgrade their app
behaves identically to before, and they can now add environments the new way. There is no automated
upgrade script — the upgrade is a copy-pasteable, reviewable set of diffs.

**Why this priority**: Apps already in flight need a real path, but it is documentation, not running
code, and it does not gate the feature's correctness. It is last because re-spinning from the new
template is the primary path; the documented upgrade is the in-flight escape hatch.

**Independent Test**: Following only the documented upgrade steps against a pre-feature app layout
yields an app whose default-path behavior matches User Story 1, with no reference to the spec
workflow in any shipped file.

**Acceptance Scenarios**:

1. **Given** a pre-feature app and the documented upgrade steps, **When** the steps are applied,
   **Then** the app gains the manifest seeded with its existing two environments and its default-path
   behavior is unchanged.
2. **Given** the upgraded app, **When** a maintainer adds an environment row, **Then** it behaves
   exactly as User Story 2 describes for a freshly-spun app.

---

### Edge Cases

- **A push to a non-environment branch (e.g. a feature branch).** The release flow must recognize the
  branch is not in the manifest and short-circuit cleanly — no tag, no deploy, no failure. Obvious
  non-environment branch patterns should not even start the release flow.
- **Two environments declared with the same tag suffix.** This is permitted (suffixes are a
  legibility label, not a correctness constraint) and cannot corrupt the version line: distinct
  numbers keep their tags distinct. The only consequence is that two environments' tags become
  visually indistinguishable — a self-inflicted legibility cost, not a system error.
- **A hotfix pushed directly to the public-face branch, ahead of other environments.** The hotfix
  consumes a number; the next environment to mint skips ahead. Gaps in an environment's number
  sequence are expected and correct for a global build-id.
- **A re-run or race producing an already-existing tag.** The derivation must refuse to overwrite or
  silently reuse an existing tag — it fails loudly so no second tag is produced and the dependent
  deploy is skipped rather than silently re-run.
- **The current MAJOR.MINOR series has many tags.** The derivation reads tags in a single pass scoped
  to the current MAJOR.MINOR series; its cost grows linearly with that series, not with environment
  count, and a MINOR bump naturally resets the working set.
- **An environment name or facet edited to an unusual combination** (e.g. a public-face environment
  that is also no-indexed). This is allowed and coherent — the facets are honored independently. The
  manifest does not reject it.
- **Local development with no build-time environment identity.** The accessor falls back to a
  constant `local` identity (not public face, no-indexed); nothing errors and no stale environment is
  reported. `local` is not a manifest row — it is the identity for "no deployment / no baked
  provenance," distinct from the `dev` branch and the `staging` environment.

---

## Requirements *(mandatory)*

### Functional Requirements

#### The manifest (source of truth)

- **FR-001**: The template MUST provide a single declarative environments manifest that lists the
  app's environments. Each environment entry MUST carry, at minimum: the git branch that drives it,
  the environment name, whether it is the public face, whether it should be no-indexed, and its tag
  suffix.
- **FR-002**: The manifest MUST be a single root-level `environments.json` file, readable by
  Node-based tooling natively and by the shell-based version derivation via the existing `node -p`
  pattern (the same mechanism `derive-version.sh` already uses to read `package.json`), so that every
  consumer reads the same source of truth with no added dependency and no format-parsing ambiguity.
- **FR-003**: The template MUST ship a default manifest describing exactly two environments —
  `production` on `main` (public face, indexed, empty tag suffix) and `staging` on `dev` (not public
  face, no-indexed, `-dev` suffix) — such that an app that does not edit it behaves identically to
  the pre-feature template. The manifest is app-agnostic (branches and facets only, no app name or
  deploy coordinates) and MUST ship final: the spin-up resolver (`init.mjs`) MUST NOT read, seed, or
  rewrite it, so it is identical in the template and in every freshly-spun app. Editing it is an
  ordinary by-hand action the maintainer takes after inheriting the app, not a spin-up step.
- **FR-004**: Adding, removing, or editing an environment MUST require editing only the manifest (and
  creating/pushing the corresponding branch) for everything in the template's reusable half — the
  derivation script, the workflow, the server, the chip, the noindex behavior, and the baked
  identity. (Per-app deploy *coordinates* — the Cloud Run service name and host for the new
  environment — are NOT in the manifest and remain a per-app edit to the documented deploy job; see
  FR-001's scope and the Clarifications.)
- **FR-005**: The template MAY ship named environment *presets* (e.g. `production`, `staging`,
  `preview`) as plain editable starting values. Presets MUST NOT be enforced: an environment's
  facets are honored as written, and no combination of facet values is rejected as invalid.
- **FR-005a**: Manifest handling MUST stay permissive: there MUST be no facet-coherence validation
  (incoherence is not representable). Two environments sharing a tag suffix MUST emit a non-blocking
  warning (a legibility footgun, not an error) rather than being rejected. The only hard failure in
  the manifest path is an unknown branch at derivation time (FR-009).

#### Versioning derivation (generalized to N environments)

- **FR-006**: The version PATCH MUST remain a global, monotonic build id derived from existing git
  tags and never committed; `package.json` continues to hold only MAJOR.MINOR.
- **FR-007**: The reuse step MUST be suffix-agnostic: if any version number is already tagged on the
  current commit (regardless of which environment's suffix it bears), the derivation MUST reuse that
  number; otherwise it MUST advance to the global maximum patch among all `v<MM>.*` tags plus one.
- **FR-008**: After determining the number, the derivation MUST stamp the pushing environment's tag
  suffix (looked up from the manifest by branch). The branch name MUST be used only as data (the
  suffix lookup), never to select a distinct code path; there MUST be no per-environment branch in
  the derivation logic.
- **FR-009**: The derivation MUST reject a push whose branch is not present in the manifest, rather
  than assuming a fixed set of branch names.
- **FR-010**: The derivation MUST refuse to overwrite or silently reuse an existing tag; on a
  collision it MUST fail loudly so no tag is produced and the dependent deploy is skipped.
- **FR-011**: The derivation MUST guarantee, by construction, that no two distinct commits can share a
  version number, and that a promotion (one environment's branch fast-forwarded to another's commit)
  reuses the existing number rather than minting a new one — for any number of environments and any
  promotion topology.
- **FR-012**: The tag format MUST be expressed as parameterized parts (a prefix plus the
  per-environment suffix), and the tag parser used to read numbers back MUST be derived from those
  same parts so that rendering and parsing cannot drift. The `MAJOR.MINOR.PATCH` integer-patch
  numbering is fixed; alternative numbering schemes are out of scope (they are a fork of the
  derivation script, not a configuration option).

#### Build-time environment identity & runtime behavior

- **FR-013**: The environment identity MUST be determined at build time and baked into the build —
  into both the frontend bundle and the compiled server — so the artifact's environment is immutable
  for the life of the image. The build MUST learn its environment from a single name build-arg and
  resolve that name's facets against `environments.json` at build time (facets MUST NOT be passed as
  separate pre-resolved build-args that could drift from the manifest).
- **FR-014**: A runtime variable MUST NOT be the source of truth for environment identity. (The
  identity is the baked value; any runtime variable is at most a pass-through of that same value, not
  an independently-settable label.)
- **FR-015**: The `noindex` behavior MUST be driven by the active environment's `noindex` facet (read
  from the baked identity), not by a hard-coded comparison against a single environment name.
- **FR-016**: The public-face / version-chip behavior MUST be driven by the active environment's
  public-face facet (the already-existing build-time public-face flag), consistent with the baked
  identity.
- **FR-017**: `/api/version` MUST report the environment from the baked identity; the frontend and the
  server MUST report the same environment for the same image.

#### Typed environment accessor (for application code)

- **FR-018**: The template MUST expose a typed environment accessor to application code on both the
  server and the frontend, providing at least the environment name, the public-face flag, and a
  convenience check against a given environment name.
- **FR-019**: The accessor MUST read the baked identity, so server and frontend always agree; in a
  context with no baked identity (e.g. local `npm run dev`), it MUST fall back to a hard-coded `local`
  identity (not public face, no-indexed) without erroring. The `local` fallback is a constant, not a
  manifest entry — the manifest lists only deployable environments — so the branch-lookup and
  derivation never encounter it.

#### CI workflow trigger (the one consumer that cannot read the manifest at trigger time)

- **FR-020**: The CI workflow MUST trigger on pushes without enumerating environment branch names in
  the trigger, since the trigger is evaluated before any code (and thus the manifest) can be read.
  Obvious non-environment branch patterns MAY be excluded from triggering.
- **FR-021**: The workflow MUST resolve, in an early lightweight step that reads the manifest, whether
  the pushed branch is an environment; if it is not, the workflow MUST short-circuit before the
  expensive build/version/deploy work runs. The pull-request merge gate MUST be unaffected by this
  change.

#### Upgrade path & propagation hygiene

- **FR-022**: The template MUST document a manual upgrade path for apps initialized before this
  change: the exact edits to introduce the manifest (seeded with the app's current two environments)
  and to rewire the de-hardcoded spots. An automated upgrade script is explicitly not provided.
- **FR-023**: No shipped file (source, tests, build/CI config, scripts, `README.md`, `docs/`,
  `DEPLOY.md`) may reference the spec workflow, spec numbers, or requirement identifiers. Rules are
  stated directly in terms of the code/config they govern.

#### Test-matrix discipline (a normative property, enforced in the versioning contract)

- **FR-024**: The version-derivation scenario matrix MUST be behavior-complete, not
  enumeration-complete: each scenario proves a behavior of the rule (mint on a fresh commit, reuse a
  number already on the commit, the hotfix gap, the collision guard, and N environments on one
  commit sharing a number), independent of how many environments an app declares. Adding an
  environment MUST NOT require adding a scenario; the matrix size is fixed by the set of distinct
  behaviors, not by environment count.

### Key Entities

- **Environments manifest**: the single declarative list of an app's environments and the source of
  truth every release-tooling consumer reads.
- **Environment entry**: one row of the manifest — a named environment with its driving branch and
  its orthogonal facets (public-face, noindex, tag suffix). It carries identity and facets only, not
  per-app deploy coordinates (service name, host). The production environment is the entry that is
  the public face; it is not otherwise privileged.
- **Environment facet**: one orthogonal, single-purpose switch on an environment (is-public-face,
  noindex, tag-suffix). Facets are honored independently and cannot contradict one another.
- **Baked environment identity**: the environment name and facets, fixed at build time and embedded
  in both the frontend bundle and the compiled server — the artifact's immutable provenance.
- **Derived version tag**: a git tag `<prefix><MM>.<patch><suffix>`; the patch is a global monotonic
  build id, the suffix identifies the environment that built that number.
- **Typed environment accessor**: the small typed object application code reads (on server and
  frontend) to branch on the current environment. Reads the baked identity, or the constant `local`
  identity when nothing was baked (local dev).
- **`local` fallback identity**: the hard-coded, non-manifest identity reported when no environment
  was baked into the build (local `npm run dev`, un-built test contexts). Not public face,
  no-indexed; distinct from the `dev` branch and the `staging` environment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An app that does not edit the default manifest produces byte-identical production
  artifacts and byte-identical release behavior compared to the pre-feature template (the chip,
  `noindex`, the reported environment, and every derived tag across the acceptance matrix all match).
- **SC-002**: Adding a new environment requires editing exactly one file (the manifest) plus
  creating/pushing its branch — zero edits to the derivation script, workflow, server, or deploy
  config — verified by diffing the files changed to add a third environment.
- **SC-003**: For any number of environments and any promotion topology, no two distinct commits
  share a version number, and every promotion reuses a number rather than minting a new one —
  verified by the behavior-complete derivation scenario matrix.
- **SC-004**: The frontend and the server report the same environment for the same built image in
  100% of cases, and a rolled-back image reports the environment it was built for.
- **SC-005**: A push to a non-environment branch results in no tag and no deploy, and does not fail
  the workflow.
- **SC-006**: The number of derivation test scenarios does not increase when an environment is added
  to an app — the matrix is sized by behaviors, not environments.
- **SC-007**: An app initialized before this change can reach the new behavior by following only the
  documented manual upgrade steps, with no automated tooling, and lands on the same default-path
  behavior as a freshly-spun app.
- **SC-008**: After the change, `check:all` and the release-tooling tests pass on a fresh copy, and no
  shipped file references the spec workflow.

## Assumptions

- The git-tag-as-version-store model and the "CI commits nothing — tags only" release flow from the
  prior feature are retained; this feature generalizes the *number of environments*, not the release
  mechanism.
- The prerequisite `APP_IS_PRODUCTION → APP_IS_PUBLIC_FACE` rename has already landed and is the
  public-face facet this feature reads; it is not redone here.
- Existing apps are primarily expected to re-spin from the updated template; the documented manual
  upgrade is the secondary path for an app already in flight. No app is in active production use such
  that an in-place automated migration is warranted.
- The static/server and prerender/dynamic spin-up axes are orthogonal to environments and are
  unaffected; environments are not a new spin-up mode axis.
- Concrete per-app deploy wiring (GCP project, service account, identity-federation provider, hosts)
  remains per-app and documented, not shipped in the template's reusable half. The manifest carries
  environment *identity and facets*, not an app's secret deploy coordinates.
- "Byte-identical" refers to the build/runtime behavior and derived tags of the default
  two-environment path, not to incidental file-layout changes (introducing the manifest file itself
  is expected).
