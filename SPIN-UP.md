# Spin-up handoff

You just created a repo from the snackbyte-base template. This file walks you (or an
agent) through resolving it into a clean, single-mode app. It is removed automatically
when you run `init`.

## 1. Install

This project runs on Node 24 (see `.nvmrc`). Make sure it's active — `node --version`
should print `v24.x`. With nvm in an interactive shell, `nvm use` switches to it; an
agent or non-interactive shell should just confirm `node --version` instead (`nvm` is a
shell function and won't be on the PATH).

```bash
node --version   # expect v24.x
cp .env.example .env   # local environment values (PORT, etc.)
npm install
```

Create the `.env` from `.env.example` as part of setup — the defaults run without it,
but this app expects a `.env` for its local config, so set it up now rather than later.

> **Not putting this app at the repo root?** This template assumes it _is_ the repo. If
> you're nesting it in a subdirectory of an existing repo (e.g. a `web/` folder beside
> another service), read [SUBDIR-LAYOUT.md](SUBDIR-LAYOUT.md) first — it's the playbook for
> the CI/npm adjustments that layout requires. The root-level case (most apps) needs none
> of it.

## 2. Decide what this app is, and resolve

Two choices, both baked into the source at spin-up (no runtime switches). These are
identity decisions, not preferences with a default — make them deliberately.

> **If you are an agent doing this spin-up: STOP here and ask the person which mode and
> which render strategy they want. Do not infer them from the app's name or purpose, and
> do not pick a default.** Present the two axes (below) factually and wait for an answer.

**Deploy mode** — does this app expose a backend API?

- **`server`** — Express serves the frontend AND an API under `/api`. Keeps
  `src/routes/` and a `/api/health` liveness endpoint, plus the dev API proxy.
- **`static`** — no API. Removes `src/routes/`, the dev proxy, and the dev API process.
  (An Express server still serves the built files; there is just no `/api`.)

**Render strategy** — when is the HTML produced?

- **`prerender`** — content rendered to real HTML at build time, so the page ships as
  markup (fast first paint, good SEO).
- **`dynamic`** — rendered on the client in the browser; no prerender step. The shipped
  HTML is an empty shell that React mounts into.

Then run the resolver (all three flags required):

```bash
npm run init -- --mode=<static|server> --render=<prerender|dynamic> --name=<repo-slug>
```

`--name` is the repo slug in kebab-case (e.g. `snackbyte-site`). It becomes the
`package.json` name (which npm requires to be lowercase) and the page `<title>` — you can
prettify the title later by editing `src/web/index.html`.

This bakes both choices into the source, deletes the unchosen paths and all template
scaffolding (this file, the init script, the template README, the machinery tests),
points the test suite at `tests/app/`, and replaces this README with the app's own.
After it runs there is no "mode"/"render" concept and no template fingerprint left —
the repo is your app.

This step is **intentionally not autonomous**: because the resolver refuses to default
the mode/render choice, an unattended/automated spin-up can't proceed past here without a
human answering. That's by design — these are identity decisions, not conveniences.

### Spec-driven development is not part of the transfer

This template is itself built with [Spec Kit](https://github.com/github/spec-kit), but it
does **not** install Spec Kit into the apps it spins up. `init` removes the whole workflow:
`.specify/`, the `.claude/speckit-*` skill mirrors, `specs/`, `CLAUDE.md`, and the
`spec:html` scripts and their dependency. What lands is a plain app.

That's deliberate. Spec Kit is installed per repo, on its own schedule; a copy shipped
inside the template would be a pinned fork that silently drifts. Set it up in the new app
the same way you set it up anywhere:

```bash
specify init --here      # then: /speckit-constitution
```

When you write that constitution, a few principles are worth carrying forward — they apply
broadly, not just to this app:

- **Spec stays in spec spaces.** `specs/`, `.specify/`, `.claude/` are AI-assist
  scaffolding. Shipped code (`src/`, `tests/`, `README`, `docs/`, scripts) must stand on
  its own and never reference specs, FRs, or principle numbers — state the rule directly
  instead. (This is exactly why `init` strips the workflow rather than shipping it: an app
  that inherited the template's spec references would carry dangling pointers to specs it
  never had.)
- **Convention over configuration.** The tooling is set up and complete; don't re-litigate
  it per feature.
- **Pinned, linted, type-safe, tested.** Node 24 LTS, TypeScript throughout, and
  `npm run check:all` (format + lint + typecheck + test) green on every change.

## 3. Verify

```bash
npm run check:all   # format + lint + typecheck + tests
npm run dev         # bring it up
```

`npm run build` produces a self-contained `dist/` — the page is `dist/index.html`. In a
prerender app, that file ships real markup (no `<!--app-html-->` placeholder); confirm
with `grep -c app-html dist/index.html` → `0`. (Prerendering runs at build, so in `dev`
the page is still the empty shell.)

## 4. Commit

The resolver cleared the template's inherited git tags, so this app starts a clean version
line rather than continuing the template's.

**No CI ships with the app.** The template runs its own release workflow, but it does not
hand that workflow to the apps it spins up — CI is installed per repo, from the release
flow's own documentation, so an app never carries a second, staler copy of that wiring.
The resolver removed `.github/` on the way out. Adding it is a separate, deliberate step:
follow **CONSUMING.md** in `jeff-fichtner/snackbyte-release-flow-action`, which owns the
workflow wiring, the `@v1` pin, the app-vs-library version-strategy choice, and the repo
settings a tag-pushing workflow needs.

Until that is done, a push runs nothing and tags nothing.

See [DEPLOY.md](DEPLOY.md) for the versioning and deploy model the release flow implements.

> **If you are an agent doing this spin-up: commit before you stop.** The spin-up must be
> **committed locally** — never leave the repo uncommitted and report the task done. A
> spun-up app with no commit is an incomplete spin-up, not a completed one.
>
> **Then STOP and ask the person before pushing to `main`.** Pushing to the default branch
> is the irreversible, outward-facing step — get explicit approval first. Have the commit
> staged and ready, show them what you're about to push, and wait for the go-ahead. (Many
> agent sandboxes will refuse a push to `main` outright; either way, the human approves
> the push.)

## Switching mode later

Mode is baked into the source, so switching is a small, deliberate code edit — not a
config flag. It is reversible and shows up in version control.

### static → server (add a backend)

1. Create `src/routes/index.ts`:

   ```ts
   import type { Express } from 'express';

   export function registerRoutes(app: Express): void {
     // app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
   }
   ```

2. In `src/server.ts`, import and call it before the static middleware:

   ```ts
   import { registerRoutes } from './routes/index.js';
   // ...inside createApp():
   registerRoutes(app);
   ```

3. In `vite.config.ts`, add the dev API proxy and import `PORT`:

   ```ts
   import { PORT } from './src/config';
   // ...in the config:
   server: { proxy: { '/api': `http://localhost:${PORT}` } },
   ```

4. In `scripts/dev.mjs`, start the API alongside Vite:

   ```js
   run(bin('tsx'), ['watch', 'src/server.ts']);
   ```

5. Add a server test under `tests/app/` (request the app via supertest and assert your
   route responds).

### server → static (drop the backend)

1. Delete `src/routes/`.
2. In `src/server.ts`, remove the `registerRoutes` import and call.
3. In `vite.config.ts`, remove the `/api` proxy and the `PORT` import.
4. In `scripts/dev.mjs`, remove the `tsx watch src/server.ts` line.
5. Remove any server/API tests under `tests/app/`.

## Rendering: prerender vs dynamic

The two render strategies, factually:

- **`prerender`** — build-time-known content is rendered to real HTML, so the page ships
  as markup (fast first paint, good SEO).
- **`dynamic`** — the page renders entirely on the client; the shipped HTML is an empty
  shell. Use when content depends on the user or live data and there's nothing
  meaningful to render at build time.

Like the deploy mode, this is a deliberate one-time choice, not a runtime switch — and
not one to default into. Decide it (or ask) up front.

### prerender → dynamic (client-side rendering)

1. In `src/web/prerender.ts`, empty the entries: `export const entries: PrerenderEntry[] = [];`
   (The build then prerenders nothing; the page ships as an empty shell that renders on
   the client. `src/web/main.tsx` already handles this — it mounts fresh when there's no
   prerendered markup.)
2. Optional: in `src/web/index.html`, remove the `<!--app-html-->` comment from the root
   div (it's just an unused injection point now).
3. Optional: drop the prerender step from `scripts/build.mjs` (the `prerender.mjs` line)
   and the prerender tests under `tests/app/`, if you want a leaner build.

### dynamic → prerender

Reverse it: restore the entry in `src/web/prerender.ts`
(`[{ html: 'index.html', element: createElement(App) }]`) and the prerender build step.
Keep prerendered content limited to what's known at build time.

## Naming: keep the brand out of the identifiers

When you resolve what this app is (§2), you are choosing **two** names, not one:

- a **descriptive** name for the code — repo, package, service, registry, secrets,
  schema. It should say what the thing does and should outlive any rebrand.
- a **brand** name for users — wordmark, `<title>`, copy, domain. This one lives in
  a single branding module and is rendered from there.

Do not let the brand become an identifier. Renaming a package is a find-replace;
renaming an Artifact Registry repository, a Cloud Run service, a secret, or a
database is a migration with CI re-authorization attached.

See [NAMING.md](NAMING.md) for the full line, the leak table, and the grep check.

## Users: multi-tenant schema, one seeded tenant

Do not scaffold this app as single-user. Every table carries an owner id from the
first migration, every query is scoped by it, and the first user is seeded rather
than signed up. Build no signup, invite, or user-administration UI until a second
user actually exists.

The schema half is nearly free now and a migration later. The product half is
expensive and premature. See [MULTI-TENANCY.md](MULTI-TENANCY.md).
