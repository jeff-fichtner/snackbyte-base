# APP_NAME

Vite + React + TypeScript app, served by Express and deployed to Google Cloud Run.

## Develop

```bash
nvm use        # Node 24 LTS (from .nvmrc)
npm install
npm run dev    # dev server at the URL Vite prints
```

Copy `.env.example` to `.env` for local environment values (e.g. `PORT`).

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

Build-time-known content is prerendered to real HTML, so pages ship as markup rather
than an empty shell. Runtime-driven views can render on the client instead.

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
