# APP_NAME

A snackbyte app, deployed to Google Cloud Run. It has two parts, each its own project with its own
dependencies and checks, and a root that runs them together:

<!-- PARTS -->

## Develop

This app runs on Node 24 (see `.nvmrc`); confirm `node --version` prints `v24.x` (`nvm use`
switches to it in an interactive shell). A part written in another language says what it needs in
its own README.

```bash
npm ci            # the root (it has no dependencies of its own)
npm run setup     # every part's dependencies
npm run dev       # every part's dev process together
```

The local environment is the committed `.env` at the root, which every part reads and which
documents every variable. While it holds only plain config, `npm run dev` needs no `op run` (see
[App secrets](#app-secrets)).

## Scripts

```bash
npm run setup        # install every part
npm run dev          # every part's dev process together
npm run build        # every part's production build, assembled as the image assembles it
npm run start        # run the assembled build
npm run check:env    # tracked env files hold only declared config and op:// references
npm run check:all    # check:env, then each part's own checks
```

Each part also has its own scripts, run from its folder or with `npm --prefix <part> run <script>`.

## App secrets

Every variable in the committed `.env` is plain config, listed on the file's `# config:` line.
`npm run check:env` (part of `check:all`) fails if a tracked env file holds a raw value for any
other key, so a secret pasted into `.env` never gets past the gate. It names the file, line and
key, never the value.

A secret lives in 1Password: vault `app-secrets`, item `APP_NAME.local`, one field named after
the variable. `.env` holds only its reference (`KEY=op://app-secrets/APP_NAME.local/KEY`), and
from then on the dev server runs as `op run --env-file=.env -- npm run dev`. Started without
`op run`, the dev and build scripts stop at startup and name the unresolved variable.

Under `op run --env-file`, the file's values win over variables already set in the shell, so
`PORT=8095 op run --env-file=.env -- npm run dev` still uses the file's `PORT`. Put an override
after the `--` instead: `op run --env-file=.env -- env PORT=8095 npm run dev`.

Production never reads an env file. `.dockerignore` keeps every `.env*` out of the image build, and
the Cloud Run service runs on the environment its deploy sets.

## CI

**This repo ships no CI workflow yet.** Adding one is a deliberate, one-time step: follow
**`CONSUMING.md`** in `jeff-fichtner/snackbyte-release-flow-action`, which owns the workflow
wiring and the repo settings it needs. Until then a push runs nothing and tags nothing.

An app with parts installs in three steps, in this order: `npm ci` (the root), `npm run setup`
(every part), then `npm run check:all`. A part in another language needs its toolchain installed in
the workflow too (its README names it).

Once wired, the flow gates pull requests and, on each push, runs the checks and **derives a
version tag from git history** — `dev` → `vX.Y.Z-dev` (staging), `main` → `vX.Y.Z`
(production). The PATCH is not stored in `package.json` (which holds only `MAJOR.MINOR`); CI
creates and pushes the **tag only**, never a commit. The tag is the deploy signal.
`environments.json` at the repo root declares which branches are environments — it is already
here, because every part's build reads it too.

See [DEPLOY.md](DEPLOY.md) for the full versioning + CI/deploy model.

## Deploy

There is one deploy path: **`cloudbuild.yaml`**, which builds the root `Dockerfile` into one image
(the web build and the server that serves it) and deploys it to Cloud Run. There is no manual deploy
script — a `gcloud run deploy --source .` shortcut would skip the ingress lock and run under
default identities, so the escape hatch is the same Cloud Build run by hand (the command is in
[DEPLOY.md](DEPLOY.md)).

Idle cost is near zero — Cloud Run scales to zero and bills only while handling a request.

## Version and environment

The app reports its version and environment at `/api/version` (when it has an API) and, outside
production, in a small on-page chip. The environment is baked into each part at build from
`environments.json` by `APP_ENV_NAME`, so the page and the server always agree; the version, commit
and date come from the deploy. Built and run locally, it reports a dev version and the `local`
environment — that's expected, not a bug.
