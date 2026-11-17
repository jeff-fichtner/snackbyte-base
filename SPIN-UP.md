# Spin-up handoff

You just copied snackbyte-base into a new app's folder (or created a repo from it). This file walks
you (or an agent) through composing it into an app. It is removed automatically when you run
`init`.

snackbyte-base is a hub: it holds templates, each a standalone project of one part, and composes
your app from the ones you choose. Your app ends up with a `web/` part (the front end), a `server/`
part (the server that serves it in production, with or without an API), and a root that runs them
together.

## 1. Check the tools

The resolver needs only Node 24 (see `.nvmrc`): `node --version` should print `v24.x`. With nvm in
an interactive shell, `nvm use` switches to it; an agent or non-interactive shell should just
confirm `node --version` instead (`nvm` is a shell function and won't be on the PATH).

```bash
node --version   # expect v24.x
```

There is nothing to install before resolving.

> **Not putting this app at the repo root?** The hub assumes the app _is_ the repo. If you're
> nesting it in a subdirectory of an existing repo, read [SUBDIR-LAYOUT.md](SUBDIR-LAYOUT.md)
> first. The root-level case (most apps) needs none of it.

## 2. Decide what this app is, and compose

Three choices, all baked into the source at spin-up (no runtime switches). These are identity
decisions, not preferences with a default — make them deliberately.

> **If you are an agent doing this spin-up: STOP here and ask the person which API and which
> render strategy they want, and the app's name. Do not infer them from the app's name or purpose,
> and do not pick a default.** Present the choices (below) factually and wait for an answer.

**API** — what serves the app, and does it expose an API under `/api`?

- **`node`** — a Node + Express + TypeScript server serves the front end AND an API under `/api`
  (starting with `/api/health` and `/api/version`).
- **`none`** — no API. A small Node + Express server still serves the built front end; there is
  just no `/api`.

**Render strategy** — when is the front end's HTML produced?

- **`prerender`** — content rendered to real HTML at build time, so the page ships as markup (fast
  first paint, good SEO).
- **`dynamic`** — rendered in the browser; the shipped HTML is an empty shell React mounts into.

**Name** — the repo slug in kebab-case (e.g. `snackbyte-site`). It becomes the package name and the
page `<title>` (prettify the title later in `web/index.html`) and names the app's 1Password item.

Then run the resolver (all three required):

```bash
npm run init -- --api=<node|none> --render=<prerender|dynamic> --name=<repo-slug>
```

It checks every choice before changing anything, then: moves the chosen front end and server into
`web/` and `server/` and resolves each one's own choices; writes the app's root (its
`package.json` with the version line and the scripts that run every part, the one committed `.env`
every part reads, the `Dockerfile` for its server, the Cloud Run deploy files, its README); removes
the templates it did not use, the hub and this file; and writes the template stamp (below). After
it runs there is no API or render switch and nothing of the hub left besides that stamp — the repo
is your app.

There is no `.env` to create. The local environment is the committed `.env` at the root, which
documents every variable: plain config is listed on its `# config:` line, and a secret never
appears in it as a value. When the app needs its first secret, create the 1Password item
`<repo-slug>.local` in the vault `app-secrets` (one field per variable, named after it), add
`KEY=op://app-secrets/<repo-slug>.local/KEY` to `.env`, and run the dev server as
`op run --env-file=.env -- npm run dev`. Until then `npm run dev` needs no `op run`.

### The template stamp

The resolver writes `.template.json` at the repo root, recording the template and the version the
app was made from (the format is `docs/template-stamp.md` in `jeff-fichtner/snackbyte-ops`, which
reads it):

```json
{ "template": "snackbyte-base", "version": "1.5.27" }
```

It finds the version rather than guessing it: from the release tag on `HEAD` in a clone of the
template, or, in a repo made with "Use this template", from the template tag whose tree matches the
repo's first commit (this reads the template's tags from GitHub). If neither finds one (no network,
or `HEAD` already changed), it writes `"version": null` and says so; set it by hand if you know the
version. Commit the file with the spin-up.

**When the app later ports changes from a newer template version, bump `version` in the same
change.** The stamp is how the fleet sees which template version each app matches.

This step is **intentionally not autonomous**: because the resolver refuses to default any choice,
an unattended spin-up can't proceed past here without a human answering. That's by design.

### Spec-driven development is not part of the transfer

This hub is itself built with [Spec Kit](https://github.com/github/spec-kit), but it does **not**
install Spec Kit into the apps it composes. `init` removes the whole workflow: `.specify/`, the
`.claude/speckit-*` skill mirrors, `specs/` and `CLAUDE.md`. What lands is a plain app.

That's deliberate. Spec Kit is installed per repo, on its own schedule; a copy shipped inside the
template would be a pinned fork that silently drifts. **Installing it — and writing the
constitution — is a later step in your project setup checklist, not part of this handoff.**

## 3. Install and verify

```bash
npm ci              # the root (no dependencies of its own)
npm run setup       # every part's dependencies
npm run check:all   # the env-file check, then each part's own checks
npm run dev         # every part's dev process together
```

`npm run build` assembles the production layout the image builds (the front end's files placed in
the server's web root) and `npm start` runs it. In a prerender app the page ships real markup; in
`dev` it is still the empty shell, because prerendering runs at build.

## 4. Commit

The resolver cleared the template's inherited git tags, so this app starts a clean version line
rather than continuing the template's.

**No CI ships with the app.** The template runs its own release workflow, but it does not hand that
workflow to the apps it composes — CI is installed per repo, from the release flow's own
documentation, so an app never carries a second, staler copy of that wiring. The resolver removed
`.github/` on the way out. Adding it is a separate, deliberate step: follow **CONSUMING.md** in
`jeff-fichtner/snackbyte-release-flow-action`, which owns the workflow wiring, the action pin, the
app-vs-library version-strategy choice, and the repo settings a tag-pushing workflow needs. The
app's README gives the install order the workflow needs (root `npm ci`, `npm run setup`, then
`npm run check:all`).

Until that is done, a push runs nothing and tags nothing.

See `DEPLOY.md` (placed at the app root) for the versioning and deploy model the release flow
implements.

> **If you are an agent doing this spin-up: commit before you stop.** The spin-up must be
> **committed locally** — never leave the repo uncommitted and report the task done. A spun-up app
> with no commit is an incomplete spin-up, not a completed one.
>
> **Then STOP and ask the person before pushing to `main`.** Pushing to the default branch is the
> irreversible, outward-facing step — get explicit approval first. Have the commit staged and ready,
> show them what you're about to push, and wait for the go-ahead.

## Switching a choice later

Every choice is baked into the source, so switching is a deliberate code edit — not a config flag.
It is reversible and shows up in version control.

### No API → a Node API (`none` → `node`)

In `server/`:

1. Create `src/routes/index.ts`:

   ```ts
   import type { Express } from 'express';

   export function registerRoutes(app: Express): void {
     // app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
   }
   ```

2. In `src/server.ts`, import `registerRoutes` from `./routes/index.js` and call it inside
   `createApp()`, before the static middleware.
3. Add a dev script to the root `package.json`: `"dev:server": "npm --prefix server run dev"`.
4. In `web/vite.config.ts`, add the dev proxy to the object passed to `defineConfig`:
   `server: { proxy: { '/api': process.env.API_URL } }`, and add `API_URL=http://localhost:8080`
   to the root `.env` (and `API_URL` to its `# config:` line).
5. Add a server test under `server/tests/app/` (request the app via supertest).

### A Node API → no API (`node` → `none`)

1. Delete `server/src/routes/` and, in `server/src/server.ts`, the `registerRoutes` import and call.
2. Remove `dev:server` from the root `package.json`.
3. Remove the `/api` proxy from `web/vite.config.ts` and `API_URL` from the root `.env`.
4. Remove any API tests under `server/tests/app/`.

### prerender → dynamic

1. In `web/src/prerender.ts`, empty the entries: `export const entries: PrerenderEntry[] = [];` (the
   build then prerenders nothing; `web/src/main.tsx` already mounts fresh when there is no
   prerendered markup).
2. Optional: remove the `<!--app-html-->` comment from the root div in `web/index.html`, and the
   prerender step from `web/scripts/build.mjs`.

### dynamic → prerender

Restore the entry in `web/src/prerender.ts` (`[{ html: 'index.html', element: createElement(App) }]`)
and the prerender step in `web/scripts/build.mjs`. Keep prerendered content limited to what's known
at build time.
