# snackbyte-base

The hub for spinning up a new snackbyte app fast. It holds a small set of templates, each a
standalone project of one part, and composes your app from the ones you choose:

| Template           | Role   | What it is                                                                        |
| ------------------ | ------ | --------------------------------------------------------------------------------- |
| `web-react`        | web    | Vite + React + TypeScript front end, built to static files (prerender or dynamic) |
| `server-node`      | server | Node + Express + TypeScript: serves the front end, and an API under `/api`        |
| `server-dotnet`    | server | C# on .NET 8, ASP.NET Core minimal API + xUnit: serves the front end and the API  |
| `deploy-cloud-run` | deploy | Cloud Build config and the per-app deploy job for Google Cloud Run                |

A composed app has a `web/` part, a `server/` part, and a root that runs them together: one
`package.json` with the version line and the scripts for every part, one committed `.env`, one
`environments.json`, the `Dockerfile` that builds both parts into one image, and the deploy files.
Every choice is resolved once, at spin-up; afterwards the app simply _is_ that combination, with no
template machinery left.

## Spin up a new app

1. Get the hub's files into your project directory. **Creating the GitHub repo is a later,
   separate step** — this one only needs the tree, so shallow-clone and copy the working files across
   (minus `.git`) rather than reaching for `--template`, which would create the remote now and clone
   into a new subdirectory.

2. **Follow [SPIN-UP.md](./SPIN-UP.md)** — the authoritative, step-by-step handoff (choose, compose,
   install, verify, commit). Start there.

The compose step takes the app's identity choices — `--api` (which server, and whether it has an
API) and `--render` (build-time HTML or client-side) — plus its name. None has a default; SPIN-UP.md
covers choosing them.

## Working on the hub

```bash
npm ci
npm run setup        # install every template (each is its own project)
npm run check:all    # the hub's checks and tests, then every template's own gate
```

- `templates/<id>/` — each template, with its own `template.json` (its role, its folder in an app,
  and the commands to set it up, run, check, build and start it), its own gate and its own README.
  A template never refers to another template or to the hub, so it can move into a repository of its
  own unchanged.
- `hub/` — the resolver (`hub/init.mjs`, run by `npm run init`), the registry of templates by role
  (`hub/registry.json`), the files it places at an app's root (`hub/files/`), and its tests.
- `npm run e2e:image` builds and runs a composed app's image for each server choice. It needs Docker,
  so it is not part of `check:all`.

## What a composed app does not include

Deliberately. Each of these is installed per repo, on its own schedule — a copy shipped from here
would be a pinned fork that silently drifts out of date.

- **CI.** The resolver deletes `.github/`. Wire the release flow from `CONSUMING.md` in
  `jeff-fichtner/snackbyte-release-flow-action`, which owns the recipe and the repo settings it
  needs.
- **The spec-driven-development workflow.** `.specify/`, the `speckit-*` skill mirrors, `specs/` and
  `CLAUDE.md` all stay behind. Run `specify init` in the new repo if you want it.
- **GCP hosting.** Standing up Cloud Run, Workload Identity Federation and the shared load balancer
  is one-time, per-project infrastructure — see `GCP-SETUP.md` in the `project-setup` repo. The
  app's `DEPLOY.md` covers only the app's own half.
- **Shared visual identity** (theme, header/footer, shared components) — distributed separately as a
  versioned package, not baked into a template.
- **Application logic** — the sample page and the `/api/health` and `/api/version` routes are
  starting points to build on.
