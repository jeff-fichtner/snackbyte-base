# snackbyte-base

A template for spinning up a new app fast: Vite + React + TypeScript, an Express
server, Vitest, ESLint + Prettier, Node 24 LTS, and a one-time choice between two
deploy modes — **static** (prerendered frontend, no API) or **server** (frontend +
Express API). It deploys to Google Cloud Run.

The template is mode-neutral. You resolve it to one mode at spin-up; from then on the
app simply _is_ that mode, with no leftover template machinery.

## Spin up a new app

1. Create your repo from this template, then clone it. Either click **"Use this
   template"** on GitHub, or from the CLI:

   ```bash
   gh repo create <your-app> --template jeff-fichtner/snackbyte-base --private --clone
   ```

   (Template population can lag the clone slightly — if the working copy looks empty,
   give it a moment and `git pull`.)

2. Install and resolve the app:

   ```bash
   nvm use            # Node 24 LTS (from .nvmrc)
   npm install
   npm run init -- --mode=server --render=prerender --name=my-app
   ```

   `init` requires two choices, both baked into the source at spin-up:
   - `--mode=static|server` — static (no backend) or server (Express + API).
   - `--render=prerender|dynamic` — prerender (build-time HTML; content apps) or
     dynamic (client-side rendering; data/auth-driven apps).

   It removes the unchosen paths and all template scaffolding (including itself),
   leaving a clean app. See [SPIN-UP.md](./SPIN-UP.md) for the full handoff and how to
   switch later.

3. Run it:

   ```bash
   npm run dev
   ```

That's it. After `init`, the repo is your app — `SPIN-UP.md` and this README are
replaced, and there is no "template" left to see.

## Scripts (available after spin-up)

```bash
npm run dev          # dev server (frontend, plus API in server mode)
npm run build        # build the distribution
npm run start        # run the built server
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run typecheck    # tsc, frontend + backend
npm test             # Vitest
npm run check:all    # format check + lint + typecheck + test
```

## What this template does not include

- **Shared visual identity** (theme, header/footer, shared components) — distributed
  separately as a versioned package, not baked into the template.
- **Application logic** — the sample page and `/api/health` liveness route are
  starting points to build on.
