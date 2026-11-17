# When the app isn't at the repo root

The hub assumes the app it composes **is** the repository — that the app's root (the one holding
`web/`, `server/` and the root `package.json`) is the repo root, so `npm ci`, `npm run setup`,
`npm run dev`, `npm run check:all`, and `npm run build` all run from the directory that holds
`.git`, and a workflow at `.github/workflows/` is the repo's workflow.

Sometimes that assumption doesn't hold. You may want the app to live in a **subdirectory**
of an existing, larger repo — e.g. a `web/` folder alongside a separate prototype, shared
content, or another service that already owns the repo root. The composed app still works in
that layout, but a fixed, knowable set of adjustments is required, because GitHub Actions
and npm both have root-relative assumptions baked in.

This file is the playbook for that case. It is **not** part of any one app — it documents a
hub-level reality so the next subdirectory spin-up doesn't have to rediscover it. If
your app is at the repo root (the common case), ignore this file entirely; nothing here
applies.

> Throughout, `<app>/` is the subdirectory you put the app in (e.g. `web/`). Substitute
> your actual directory name.

## Why root-level is assumed (and what breaks otherwise)

Three things are root-relative and will misbehave when the app is in a subdirectory:

1. **npm** — `npm ci` / `npm run *` resolve `package.json` and `package-lock.json` from the
   current directory. CI runs from the repo root by default, so it won't find them.
2. **GitHub Actions workflows** — GitHub only reads workflow files from the **repo-root**
   `.github/workflows/`. A workflow at `<app>/.github/workflows/ci-cd.yml` is never run.
3. **`actions/setup-node` npm cache** — `cache: 'npm'` hashes a `package-lock.json` to key
   the cache. It looks at the repo root unless told otherwise, so the cache silently
   never hits (or errors) when the lockfile is under `<app>/`.

Everything below is just resolving those three facts.

## The layout

Run the hub's `init` in a clean throwaway directory (so the resolver sees a normal root-level
copy of the hub and composes it correctly), then copy the composed tree into `<app>/` of the
target repo. Exclude things the host repo already owns or that don't belong
nested:

- `.git` — the host repo's, not the hub's.
- `node_modules` — reinstall under `<app>/`.
- `.github/` — its workflow moves to the **repo root** (see below), it does not live under
  `<app>/`.
- `.specify/`, `.claude/`, `specs/` — Spec Kit and agent context belong at the repo root,
  one set per repo. Don't nest a second copy under `<app>/`.

After copying, `cd <app>` and run `npm ci && npm run setup` there.

## CI: the workflow lives at the repo root, pointed into `<app>/`

GitHub only discovers workflows in the **repo root** `.github/workflows/`, so a workflow at
`<app>/.github/workflows/` is never run. This app ships no workflow of its own — you add one
per repo — so there is nothing to move; you simply create it at the root.

**The subdirectory wiring belongs to the release flow, and its `CONSUMING.md` owns it:** see
**"Consuming from a subdirectory"** in `jeff-fichtner/snackbyte-release-flow-action`. It covers
`defaults.run.working-directory`, passing both `manifest: <app>/environments.json` and
`package-json: <app>/package.json` to the Action (a `uses:` step, which `working-directory`
does not reach), the `cache-dependency-path` fix, and the `paths:` trigger trade-off.

### The `deploy` job (per app, as always)

The `deploy` job is per-app regardless of layout — copy it in from the app's `DEPLOY.md` as
usual. The only subdirectory-specific part: the step that ships the build source
(`gcloud builds submit`) must run from `<app>/` so it uploads the `<app>/` tree, picking up
`<app>/cloudbuild.yaml` and `<app>/Dockerfile`. A top-level `defaults.run.working-directory`
covers this; if you scoped `working-directory` to individual jobs, add it to the submit step
too.

## What this does NOT change

- **The release-flow Action and the tag scheme** — versioning derives from **git tags**, which
  are repo-global, not directory-scoped; a subdirectory app's tags are the repo's tags. A
  second releasable in the same repo therefore gets its own `tag-prefix:`
  (`client-node-v0.1.0`), a namespace mutually blind to the bare `v…` one. The recipe is
  **"Two releasables in one repository"** under "Consuming from a subdirectory" in the
  Action's `CONSUMING.md`.
- **App source and choices** — none of the `init` choices or in-source code care where the app
  sits. `--api`, `--render`, `web/`, `server/`, tests, the dev scripts: all identical to a
  root-level app.
- **GCP wiring** — project, WIF, service account, Cloud Run, load balancer, DNS, certs are
  all per-app/per-fleet and unaffected by the subdirectory layout. Follow `DEPLOY.md`.

## Checklist

- [ ] App tree copied into `<app>/`; `.git`, `.github/`, `.specify/`, `.claude/`, `specs/`,
      `node_modules` excluded.
- [ ] `npm ci && npm run setup` run from `<app>/`.
- [ ] Release-flow workflow created at the **repo root** and made subdirectory-aware, per
      "Consuming from a subdirectory" in the Action's `CONSUMING.md`.
- [ ] `deploy` job copied from `DEPLOY.md`; its `gcloud builds submit` runs from `<app>/`.
- [ ] If the repo holds another releasable, each has its own workflow, `manifest:`,
      `package-json:`, and the library's `tag-prefix:`, per the Action's two-releasables
      recipe.
