<!-- TEMPLATE-GUARD START -->
# This is the snackbyte-base template — do not edit it to build an app

This repo is a **template**, not an application. If you are here to build or change an
app, you are in the wrong place: spin a new app out of this template and work there.

**Do not modify this repo to make an app.** Editing the template's own source to turn it
into your app defeats its purpose and corrupts it for every future spin-up. The only
changes that belong here are deliberate improvements to the template itself.

**Just cloned a repo you created from this template?** Then this is your app's repo and
seeing "snackbyte-base / wrong place" is expected — it's the un-resolved template state.
Follow `SPIN-UP.md` and run the resolver; it renames everything to your app and removes
this guard. You're not in the wrong place, you're at step zero.

To spin up a new app, follow `SPIN-UP.md`. After the spin-up resolver runs, this guard
is removed and the resulting repo is a normal app you can edit freely.

<!-- TEMPLATE-GUARD END -->

<!-- SPECKIT START -->
For foundational context (technologies, project structure, shell commands), read the
skeleton plan: `specs/001-template-skeleton/plan.md`

Active feature — consume the release-flow GitHub Action (delegate the CI-side release flow —
resolve-env + version derivation — to `snackbyte-release-flow-action@v1`; the app-runtime
manifest readers stay): `specs/005-release-flow-action/spec.md`

Moved out — the ClickUp task-sync extension is no longer *authored* here. It is a Spec Kit
plug, not a template asset, so its source now lives in the `snackbyte-speckit-engine` repo
(which is `snackbyte-clickup-sync` renamed). The in-tree copy the template used to own was
deleted.

What is under `.specify/extensions/` now — `engine`, `git`, `specify`, `analyze`, `clickup`,
`agent-context` — is the template *consuming* that engine, the same way any project does. It
is installed tooling, not template source: fix a bug in the engine repo and reinstall, never
by editing the copy here. **Every spun-up app gets none of it** — the resolver deletes
`.specify/` wholesale.

Prior feature — declarative N-environment manifest: `specs/003-env-manifest/plan.md`

Prior feature — derived-tag versioning + branch-as-environment staging:
`specs/002-derived-tag-staging/plan.md`
<!-- SPECKIT END -->

## Settled: the template does not ship what the setup checklist owns (2026-09-02)

Project setup is owned by the machine-level checklist at
`~/snackbyte/tools/project-setup/SETUP-CHECKLIST.md` (repo
`jeff-fichtner/project-setup`). The checklist supersedes this template for setup
concerns; the template predates it and bootstrapped everything only because nothing
else existed yet. **This template's job is the app skeleton** — Vite/React/TS source,
the mode/render resolver, the Cloud Run packaging — not project setup.

The rule, and it is absolute: **anything setup-shaped that the checklist covers does
not ship from here.** It is installed fresh, per project, via the checklist. There is
no "but this one is thin" exemption — a half-applied rule is what produced the
contradictory notes this replaced.

The template keeps all of it **for its own use** and the resolver (`scripts/init.mjs`)
deletes it on spin-up. Nothing was removed from this repo; the delete list grew:

- `.specify/`, the `speckit-*` skill mirrors, `specs/`, and the stub `CLAUDE.md` — a
  shipped copy would be a spec-kit fork pinned at whatever version built the template.
- The `spec:html`/`spec:html:watch` scripts and the `@snackbyte/spec-render`
  devDependency (plus its lockfile entries — `npm ci` fails if they disagree).
- `.github/workflows/ci-cd.yml`, and `.github/` once empty. CI is installed per repo
  from `CONSUMING.md` in `jeff-fichtner/snackbyte-release-flow-action`, which is the
  authoritative source for the wiring, the `@v1` pin, the version-strategy choice, and
  the repo settings a tag-pushing workflow needs.

`environments.json` is deliberately NOT on that list — it is app build input
(`scripts/build.mjs` generates `src/env.generated.ts` from it), not release-flow
config. Nor is the app-runtime half (`scripts/resolve-env.mjs`, `src/environments.ts`).

`MIGRATION.md` is gone from the repo outright — it documented the ClickUp extension,
which moved to `snackbyte-speckit-engine`. It left with its subject, not under this rule.

**When you add anything to this template, ask first whether the checklist covers it.**
If it does, it belongs in the resolver's delete list, not in the shipped skeleton.

### Where the boundary now sits

Three repos, no overlap, each the single source for its half:

- **`project-setup` (the checklist)** — the ORDER of setup and the yes/no per step. It points
  at owners; it does not restate their mechanics.
- **`snackbyte-release-flow-action` → `CONSUMING.md`** — everything about the release flow:
  the recipes, version derivation, promotion, subdirectory wiring, and the two repo settings
  it needs (the Actions write permission and branch protection).
- **this repo** — the app skeleton, and `DEPLOY.md` for what happens *after* a tag exists:
  GCP, Cloud Run, Workload Identity, the per-app deploy job.

The test to apply before adding anything here: **could this be said by the checklist or by
CONSUMING.md?** If yes, it belongs there and this repo links to it.
