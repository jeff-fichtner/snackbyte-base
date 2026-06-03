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

## CI

A GitHub Action (`.github/workflows/main.yml`) gates pull requests and, on each push to
`main`, runs the checks, bumps the patch version, commits that bump with `[skip ci]`, and
pushes a matching `vX.Y.Z` tag — the deploy signal. (It pushes both the commit and the tag.)

**One-time setup, before the first push to `main`:** enable
**Settings → Actions → General → Workflow permissions → "Read and write permissions"**.
The first push tags on success; without this enabled the checks still pass but the tag
step fails with a 403. See [DEPLOY.md](DEPLOY.md) for the full CI/deploy model.

## Deploy

```bash
./scripts/deploy.sh <service-name> <gcp-project> [region]   # builds the image and runs gcloud run deploy
```

Deploys a container to Cloud Run. Idle cost is near zero — Cloud Run scales to zero
and bills only while handling a request.

## Spec-driven development

This project is set up for spec-driven development (GitHub Spec Kit). Nothing is
spec'd yet — start here:

1. **`/speckit-constitution`** — establish this app's principles. A few worth carrying
   forward (they apply broadly, not just to this app):
   - **Spec stays in spec spaces.** `specs/`, `.specify/`, `.claude/` are AI-assist
     scaffolding. Shipped code (`src/`, `tests/`, `README`, `docs/`, scripts) must
     stand on its own and never reference specs, FRs, or principle numbers — state the
     rule directly instead.
   - **Convention over configuration.** Spin-up is fast and complete; don't
     re-litigate tooling per feature.
   - **Pinned, linted, type-safe, tested.** Node 24 LTS, TypeScript throughout, and
     `npm run check:all` (format + lint + typecheck + test) green on every change.
   - Then add principles specific to this app.
2. **`/speckit-specify`** → **`/speckit-plan`** → **`/speckit-tasks`** →
   **`/speckit-implement`** — one feature at a time, one branch per feature.
