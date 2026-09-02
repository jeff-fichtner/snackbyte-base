# snackbyte-base

A template for spinning up a new app fast: Vite + React + TypeScript, an Express
server, Vitest, ESLint + Prettier, Node 24 LTS, and a one-time choice between two
deploy modes — **static** (prerendered frontend, no API) or **server** (frontend +
Express API). It deploys to Google Cloud Run.

The template is mode-neutral. You resolve it to one mode at spin-up; from then on the
app simply _is_ that mode, with no leftover template machinery.

## Spin up a new app

1. Get the template's files into your project directory. **Creating the GitHub repo is a
   later, separate step** — this one only needs the tree, so shallow-clone and copy the
   working files across (minus `.git`) rather than reaching for `--template`, which would
   create the remote now and clone into a new subdirectory.

2. **Follow [SPIN-UP.md](./SPIN-UP.md)** — it's the authoritative, step-by-step handoff
   (install, resolve, commit). Start there.

The resolve step bakes two identity choices into the source — `--mode` (static vs. an
Express API) and `--render` (build-time HTML vs. client-side). They have no default;
SPIN-UP.md covers choosing them. After `init` runs, the repo is a clean single-mode app
with no template scaffolding left.

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

Deliberately. Each of these is installed per repo, on its own schedule — a copy shipped
from here would be a pinned fork that silently drifts out of date.

- **CI.** The resolver deletes `.github/` on spin-up. Wire the release flow from
  `CONSUMING.md` in `jeff-fichtner/snackbyte-release-flow-action`, which owns the recipe
  and the repo settings it needs.
- **The spec-driven-development workflow.** `.specify/`, the `speckit-*` skill mirrors,
  `specs/` and `CLAUDE.md` all leave with the transfer. Run `specify init` in the new repo
  if you want it.
- **GCP hosting.** Standing up Cloud Run, Workload Identity Federation and the shared load
  balancer is one-time, per-project infrastructure — see `GCP-SETUP.md` in the
  `project-setup` repo. `DEPLOY.md` here covers only the app's own half.
- **Shared visual identity** (theme, header/footer, shared components) — distributed
  separately as a versioned package, not baked into the template.
- **Application logic** — the sample page and `/api/health` liveness route are
  starting points to build on.
