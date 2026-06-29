# Implementation Plan: Declarative N-Environment Manifest

**Branch**: `main` (feature dir `003-env-manifest`) | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-env-manifest/spec.md`

## Summary

Replace the **hard-coded two-environment** assumption (`main → production`, `dev → staging`, repeated
by literal name in six places) with **one declarative manifest** — a root-level `environments.json`
that lists the app's environments. Every release-tooling consumer reads the manifest instead of
hard-coding two named streams. The default manifest **describes** today's two environments exactly, so
an app that never edits it is **byte-identical** to the pre-feature template; adding the Nth
environment is "add a row, push the branch."

The change is concentrated in the release/build tooling tier plus two runtime touch-points. The one
genuine engine change is the version derivation's **reuse lookup**: it stops being branch-specific
("reuse the named opposite stream's tag on this commit") and becomes **suffix-agnostic** ("reuse
*whatever* number is already on this commit, else global-max + 1, then stamp *this* environment's
suffix"). That single change generalizes versioning to N environments, topology-independently, while
preserving both invariants (no two commits share a number; promotion reuses, never mints). The branch
name becomes pure data — a manifest key for the suffix — selecting no code path. Environment identity
becomes **build-time and immutable** (baked into the frontend bundle and the compiled server from a
single name build-arg whose facets are resolved against the manifest at build time); the runtime
`APP_ENV` stops being a source of truth. A typed `env` accessor (server + frontend) lets app code
branch on the current environment, with a constant `local` fallback when nothing was baked. A
documented manual upgrade path serves apps spun up before this. Verified by the release-tooling test
suite + a fresh-app spin-up against the behavior-complete acceptance matrix.

## Technical Context

**Language/Version**: TypeScript ~5.9+ on Node 24 LTS (unchanged). Bash for the version derivation and
the CI `resolve-env` step; YAML for the workflow; Dockerfile build-args; `node -p` as the shared
manifest reader across Node and shell.

**Primary Dependencies**: Vite + React (frontend), Express (server mode), Vitest (test) — unchanged.
**No new runtime or build dependency** is added: `environments.json` is plain JSON, read by Node
natively and by the shell derivation via the existing `node -p` pattern already used for
`package.json`.

**Storage**: N/A. Git tags remain the version store (the patch is a derived global build id, never in
`package.json`). `environments.json` is configuration, not data.

**Testing**: Vitest for the runtime invariants (noindex from the active env's facet, the chip, the
`env` accessor on both server and frontend, the `local` fallback). The derivation is verified by the
shell scenario suite (`scripts/derive-version.test.sh`, run via `test:release`) — and, per FR-024,
that matrix is **behavior-complete, not enumeration-complete**: its size is fixed by distinct
behaviors, never by environment count.

**Target Platform**: Google Cloud Run behind the shared global external HTTPS LB (unchanged). The
manifest carries environment identity + facets only — never an app's deploy coordinates (service
name, host, project), which stay per-app and documented.

**Project Type**: Template/skeleton repo (web app: React frontend + optional Express backend, shared
build) plus its release/deploy tooling. This feature touches the tooling tier primarily, with two
runtime touch-points (noindex, the `env` accessor) and the build-arg threading.

**Performance Goals**: N/A (build/release tooling). The derivation stays O(N) single-pass scoped to
the current MAJOR.MINOR tag series; cost grows with that series, not with environment count. Spin-up
remains <5 min (Principle II) — the manifest ships final and adds no spin-up decision.

**Constraints**: Default two-environment path byte-identical (SC-001); `check:all` + `test:release`
green (SC-008); SPINUP mode axes preserved and untouched (environments are not a mode axis); no spec
citations in shipped files (Principle VIII / FR-023); CI commits nothing — tags only (FR-006);
collisions structurally impossible (FR-011); the manifest is the single source of truth read by every
consumer (FR-002), including at build time (FR-013).

**Scale/Scope**: One solo maintainer; one template consumed by many apps. ~9 template files touched
(the new `environments.json`, a shared manifest reader, `derive-version.sh` + its test, `ci-cd.yml`
trigger/`resolve-env`, `cloudbuild.yaml`, `Dockerfile`, `vite.config.ts` + `prerender.mjs`,
`src/version.ts` + `src/web/version.ts`, `src/server.ts`, `DEPLOY.md`). No NEEDS CLARIFICATION items —
the design is fully resolved in the spec (six recorded clarifications + the proven versioning model).

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after Phase 1.*

| Principle | Compliance |
|---|---|
| I. Single Template, Mode Resolved at Spin-Up | No new mode axis. Environments are **not** a spin-up mode — the manifest ships final and `init.mjs` never touches it (FR-003). The static/server + prerender axes are untouched. Build-time environment identity is analogous to build-time *mode* identity the principle already endorses. ✅ |
| II. Convention Over Configuration | Adding the manifest adds **zero** spin-up decisions: it ships with the default two environments and is identical in template and spun app. The release flow is inherited with no re-decisions; editing the manifest is an optional post-spin-up action, not a setup step. ✅ |
| III. Skeleton Only — No Application Logic | The manifest carries environment identity + facets only — **no app-specific business logic, no deploy coordinates** (service/host/project stay per-app, documented; Clarify Q3). The `env` accessor is generic plumbing, not domain logic. ✅ |
| IV. Two-Tier Propagation | This is a skeleton concern (release tooling + build/runtime plumbing). Existing apps adopt it by re-spinning, or via the **documented manual upgrade** (FR-022) — the tier-1 one-time-copy path, appropriate since nothing is in production use. ✅ |
| V. Uniform Deploy Path (Cloud Run Default) | Same Cloud Run path. `cloudbuild.yaml` keeps its role; the only change is reading the environment from the manifest by name instead of hard-coded staging knobs. ✅ |
| VI. Prerender By Default | `prerender.mjs` continues to mirror `vite.config.ts` exactly; the only change is that both read the baked environment identity from the same source. Prerender stays default and byte-identical for prod (SC-001). ✅ |
| VII. Pinned, Linted, Type-Safe, Tested | Node 24 pin unchanged; `check:all` + `test:release` must pass (SC-008). New runtime behavior (noindex facet, the `env` accessor, the `local` fallback) gets Vitest coverage; the derivation gets behavior-complete shell coverage. ✅ |
| VIII. Speckit Stays in Speckit Spaces | **Active constraint.** The new `environments.json`, the de-hardcoded code, `DEPLOY.md`, and the upgrade doc MUST state rules directly and cite no spec/FR (FR-023). Enforced as an implementation rule + a verification grep. ✅ (by construction) |

**Result**: PASS. No violations; Complexity Tracking empty. Principles III and VIII are the ones to
actively police: keep deploy coordinates out of the shipped manifest (III), and strip any spec
citations from shipped files (VIII).

## Project Structure

### Documentation (this feature)

```text
specs/003-env-manifest/
├── plan.md              # This file
├── research.md          # Phase 0 — consolidates the already-settled decisions (no agents dispatched)
├── data-model.md        # Phase 1 — the manifest schema + entities (environments.json shape)
├── quickstart.md        # Phase 1 — how an app adds an environment + how to verify the default is unchanged
├── contracts/
│   ├── versioning.md    # The derivation contract: suffix-agnostic reuse, invariants, and the
│   │                    #   BEHAVIOR-COMPLETE scenario matrix (the test oracle; FR-024)
│   └── env-identity.md  # The build→runtime env-identity contract: name build-arg → baked facets →
│                        #   accessor/noindex/chip/version, and the `local` fallback
└── checklists/
    └── requirements.md  # Spec quality checklist (done; 16/16)
```

### Source Code (repository root) — files this feature changes

```text
snackbyte-base/
├── environments.json            # NEW — the manifest. Default: production (main, public-face, "",
│                                #   indexed) + staging (dev, not-public-face, "-dev", noindex).
│                                #   App-agnostic; ships final; init.mjs never touches it.
├── src/
│   ├── environments.ts          # NEW — the shared manifest reader + typed Environment type + the
│   │                            #   `local` fallback constant. Imported by server-side consumers.
│   ├── env.ts                   # NEW (or fold into version.ts) — the typed `env` accessor
│   │                            #   (name, isPublicFace, is()) for SERVER app code, from baked identity.
│   ├── version.ts               # Report `environment` from the BAKED identity (not runtime APP_ENV).
│   ├── web/
│   │   ├── env.ts               # NEW — the typed `env` accessor for FRONTEND app code, from the
│   │   │                        #   inlined define token (mirrors src/env.ts).
│   │   └── version.ts           # UNCHANGED in intent (chip already build-keyed via isPublicFace).
│   └── server.ts                # noindex middleware reads the ACTIVE ENV's noindex facet (baked),
│                                #   not `APP_ENV === 'staging'`. Stays OUTSIDE SPINUP markers.
├── scripts/
│   ├── derive-version.sh        # Reuse step → SUFFIX-AGNOSTIC; suffix + branch-validity from the
│   │                            #   manifest (node -p). No per-env branch. Warn on duplicate suffix.
│   ├── derive-version.test.sh   # Rephrase scenarios to BEHAVIOR-complete (env-agnostic stand-ins);
│   │                            #   add the "3 envs on one commit share a number" behavior. No growth.
│   └── prerender.mjs            # Read the baked env identity (name → facets) identically to vite.
├── vite.config.ts               # Bake the env identity: APP_ENV_NAME build-arg → resolve facets from
│                                #   environments.json at build → define __APP_ENV_NAME__ (+ keep chip).
├── Dockerfile                   # +ARG APP_ENV_NAME (single name arg); thread into the build step.
├── cloudbuild.yaml              # Pass _APP_ENV_NAME (the env name) as the build-arg; runtime env
│                                #   carries the same name as a pass-through, not a source of truth.
├── .github/workflows/
│   └── ci-cd.yml.disabled       # Trigger: wildcard push (branches-ignore noise) + a lightweight
│                                #   `resolve-env` first job that reads the manifest and short-circuits
│                                #   non-environment branches. PR merge gate unaffected.
├── scripts/init.mjs             # Workflow-rewrite header updated to describe the manifest model; the
│                                #   manifest itself is NOT touched by the resolver (FR-003).
└── DEPLOY.md                    # Document the manifest model, the suffix-agnostic derivation, the
                                 #   build→identity flow, AND the manual upgrade path for pre-feature apps.
```

The `deploy` job's per-app service/host mapping stays per-app documented code in `DEPLOY.md` (Clarify
Q3) — it is NOT folded into the shipped manifest (Principle III).

**Structure Decision**: Single template repo; this feature concentrates on the release/build tooling
tier (manifest + derivation + workflow + cloudbuild + build-args) plus two runtime touch-points (the
noindex facet read and the typed `env` accessor). The manifest is the single source of truth; a small
shared reader (`src/environments.ts`) gives Node consumers a typed view, while the shell derivation
and the build read the same file via `node -p`. The template is the source of truth; existing apps
re-spin or follow the documented upgrade.

## Execution (build → verify)

The template is built clean against the resolved design, then verified; nothing gates on a live system.

- **Build the manifest + de-hardcode.** Add `environments.json` (default two envs) and the shared
  reader; make `derive-version.sh`'s reuse suffix-agnostic and its branch/suffix manifest-driven;
  rephrase the test matrix to behavior-complete; thread the single `APP_ENV_NAME` build-arg
  (Dockerfile/vite/prerender/cloudbuild) and bake the identity; switch `server.ts` noindex to the
  facet; add the typed `env` accessor (server + frontend) with the `local` fallback; update
  `version.ts` to report the baked identity; rewrite the workflow trigger to wildcard + `resolve-env`;
  update `init.mjs`'s header (without touching the manifest); rewrite `DEPLOY.md` incl. the upgrade
  section. Keep the default path byte-identical (SC-001); strip all Principle-VIII citations.
- **Verify by the suites + a fresh spin-up.** `check:all` + `test:release` green (SC-008). Run the
  behavior-complete derivation matrix (versioning contract). Spin a fresh app and exercise the
  acceptance scenarios: default byte-identical (US1), add a `qa` env touching only the manifest (US2),
  the typed accessor agreeing across server/frontend with the `local` fallback (US3), and the
  documented upgrade against a pre-feature layout (US4).

## Complexity Tracking

> No constitution violations. Section intentionally empty.
