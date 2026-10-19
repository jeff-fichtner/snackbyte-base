# APP_NAME

Vite + React + TypeScript app, deployed to Google Cloud Run.

## Develop

This app runs on Node 24 (see `.nvmrc`); confirm `node --version` prints `v24.x`
(`nvm use` switches to it in an interactive shell).

```bash
node --version   # expect v24.x
npm install
npm run dev      # dev server at the URL Vite prints
```

The local environment is the committed `.env`, which documents every variable. While it holds
only plain config, `npm run dev` needs no `op run` (see [App secrets](#app-secrets)).

## Scripts

```bash
npm run dev          # dev server
npm run build        # build the distribution into dist/
npm run start        # run the built server
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run typecheck    # tsc, frontend + backend
npm test             # Vitest
npm run check:env    # tracked env files hold only declared config and op:// references
npm run check:all    # format check + lint + typecheck + check:env + test
```

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

Production never reads an env file. The server does not load `.env` (only the dev and build
scripts do), `.dockerignore` keeps every `.env*` out of the image build, and the image's runtime
stage copies only `dist/`. The Cloud Run service runs on the environment its deploy sets.

## Rendering

Runtime-driven views render on the client. Where content is known at build time, it can be
prerendered to real HTML so those pages ship as markup rather than an empty shell.

Prerendering runs at **build** time, not in dev — so in `npm run dev` the page is the
empty shell (`<div id="root"></div>`) that React mounts into. Run `npm run build` to see
the prerendered markup.

## CI

**This repo ships no CI workflow yet.** Adding one is a deliberate, one-time step: follow
**`CONSUMING.md`** in `jeff-fichtner/snackbyte-release-flow-action`, which owns the workflow
wiring and the repo settings it needs. Until then a push runs nothing and tags nothing.

Once wired, the flow gates pull requests and, on each push, runs the checks and **derives a
version tag from git history** — `dev` → `vX.Y.Z-dev` (staging), `main` → `vX.Y.Z`
(production). The PATCH is not stored in `package.json` (which holds only `MAJOR.MINOR`); CI
creates and pushes the **tag only**, never a commit. The tag is the deploy signal.
`environments.json` at the repo root declares which branches are environments — it is already
here, because the app's own build reads it too.

See [DEPLOY.md](DEPLOY.md) for the full versioning + CI/deploy model.

## Deploy

There is one deploy path: **`cloudbuild.yaml`**, which builds the image and deploys it to Cloud
Run. There is no manual deploy script — a `gcloud run deploy --source .` shortcut would skip the
ingress lock and run under default identities, so the escape hatch is the same Cloud Build run by
hand (the command is in [DEPLOY.md](DEPLOY.md)).

Once CI is wired (see **CI** above — it is not, yet), a push to an environment branch derives a
version tag and the chained `deploy` job runs that build for you.

Idle cost is near zero — Cloud Run scales to zero and bills only while handling a request.

## Version

The app reports its version at `/api/version` and (in non-prod) a small on-page chip. The
server endpoint reads `APP_VERSION` / `BUILD_GIT_COMMIT` / `BUILD_DATE` from **runtime
environment variables** — the deploy sets these, so a deployed release reports
its true `vX.Y.Z` / commit / date at `/api/version`. Built and run locally (no deploy
env), it self-reports `0.0.0-dev` / `commit: dev` / `environment: development` — that's
expected, not a bug. (The frontend chip's version comes from `package.json` at build
time; its commit/date are populated only if the build passes them as Docker build-args —
see [DEPLOY.md](DEPLOY.md).)
