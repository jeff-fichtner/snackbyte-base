# snackbyte-base

A reusable skeleton for spinning up a new app fast: Vite + React + TypeScript, an
Express server, Vitest, ESLint + Prettier, and a single `static`/`server` deploy-mode
switch. Both modes build and deploy from one unmodified copy.

## Spin up a new app

1. Click **"Use this template"** on GitHub to create your repo, then clone it.
2. Match the runtime and install:

   ```bash
   nvm use        # Node 24 LTS (from .nvmrc)
   npm install
   ```

3. Choose the deploy mode (see below), then run it:

   ```bash
   npm run dev    # Vite dev server (+ Express API in server mode)
   ```

   The app renders at the URL Vite prints.

## Deploy mode: `static` vs `server`

The mode is set once, via the `DEPLOY_MODE` environment variable — the single place it
lives. Copy `.env.example` to `.env` and set it:

- **`server`** (default) — Express serves the built frontend and can expose API
  routes under `/api`. Most apps.
- **`static`** — the built frontend is served with no API routes.

Switching modes changes only `DEPLOY_MODE` and the deploy target. It never requires
editing application code: a static app that later needs a backend just flips to
`server` and adds routes.

An unset `DEPLOY_MODE` defaults to `server`. Any value other than `static` or `server`
fails fast with an error rather than guessing.

## Scripts

```bash
npm run dev          # dev server (frontend, plus API in server mode)
npm run build        # build for the configured mode
npm run start        # run the built server (server mode / static container)
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run typecheck    # tsc, frontend + backend
npm test             # Vitest
npm run check:all    # format check + lint + typecheck + test
```

All checks pass on a fresh copy with no extra configuration.

## Rendering

Build-time-known content is prerendered to real HTML, so a static page ships as
markup rather than an empty shell. Runtime-driven apps (games, interactive tools) can
render entirely on the client — the skeleton supports both without changes.

## Deploy

Both modes deploy the same way: a container on Cloud Run. A static app is just the
container serving files with no API routes.

```bash
./scripts/deploy.sh    # builds the image and runs `gcloud run deploy`
```

Idle cost is near zero — Cloud Run scales to zero and bills only while handling a
request.

For a high-traffic, global, or latency-sensitive static app, you can instead deploy
the built assets to Cloud Storage + Cloud CDN for instant, edge-served responses. That
is a performance choice, not a default.

## What this skeleton does not include

- **Shared visual identity** (theme, header/footer, shared components) — distributed
  separately as a versioned package, not baked into the skeleton.
- **Application logic** — the sample page and `/api/health` route exist only to prove
  the skeleton works. Replace them.
