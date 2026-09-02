# APP_NAME

Vite + React + TypeScript app, deployed to Google Cloud Run.

## Develop

This app runs on Node 24 (see `.nvmrc`); confirm `node --version` prints `v24.x`
(`nvm use` switches to it in an interactive shell).

```bash
node --version   # expect v24.x
cp .env.example .env   # local environment values (PORT, etc.)
npm install
npm run dev      # dev server at the URL Vite prints
```

Create the `.env` from `.env.example` as part of setup — the defaults run without it,
but this app expects a `.env` for its local config, so set it up now rather than later.

## Scripts

```bash
npm run dev          # dev server
npm run build        # build the distribution into dist/
npm run start        # run the built server
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run typecheck    # tsc, frontend + backend
npm test             # Vitest
npm run check:all    # format check + lint + typecheck + test
```

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

```bash
./scripts/deploy.sh <service-name> <gcp-project> [region]   # builds the image and runs gcloud run deploy
```

Deploys a container to Cloud Run. Idle cost is near zero — Cloud Run scales to zero
and bills only while handling a request.

## Version

The app reports its version at `/api/version` and (in non-prod) a small on-page chip. The
server endpoint reads `APP_VERSION` / `BUILD_GIT_COMMIT` / `BUILD_DATE` from **runtime
environment variables** — `scripts/deploy.sh` sets these, so a deployed release reports
its true `vX.Y.Z` / commit / date at `/api/version`. Built and run locally (no deploy
env), it self-reports `0.0.0-dev` / `commit: dev` / `environment: development` — that's
expected, not a bug. (The frontend chip's version comes from `package.json` at build
time; its commit/date are populated only if the build passes them as Docker build-args —
see [DEPLOY.md](DEPLOY.md).)
