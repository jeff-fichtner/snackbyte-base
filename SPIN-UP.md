# Spin-up handoff

You just created a repo from the snackbyte-base template. This file walks you (or an
agent) through resolving it into a clean, single-mode app. It is removed automatically
when you run `init`.

## 1. Install

```bash
nvm use        # Node 24 LTS
npm install
```

## 2. Decide what this app is, and resolve

Two choices, both baked into the source at spin-up (no runtime switches). These are
identity decisions, not preferences with a default — make them deliberately.

> **If you are an agent doing this spin-up: stop here and ask the person which mode and
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

Then run the resolver (both flags required):

```bash
npm run init -- --mode=<static|server> --render=<prerender|dynamic> --name=<your-app-name>
```

This bakes both choices into the source, deletes the unchosen paths and all template
scaffolding (this file, the init script, the template README, the machinery tests),
points the test suite at `tests/app/`, and replaces this README with the app's own.
After it runs there is no "mode"/"render" concept and no template fingerprint left —
the repo is your app.

## 3. Verify

```bash
npm run check:all   # format + lint + typecheck + tests
npm run dev         # bring it up
```

## 4. Enable CI, then push

The release workflow tags `main` on the first push (it runs the checks, bumps the
version, and pushes a `vX.Y.Z` tag). For that tag step to succeed, the repo must allow
Actions to write — a one-time setting that **must be enabled before the first push**:

- **Settings → Actions → General → Workflow permissions → "Read and write permissions"**
  → Save.

There is no API for this; it's a manual change in the GitHub web UI.

> **If you are an agent doing this spin-up: stop and ask the person to set this, and wait
> for them to confirm, before you push to `main`.** You cannot set it yourself, and
> pushing first makes the first release fail with a 403.

Once it's enabled, commit the spin-up and push. The first push to `main` produces
`v0.0.1`. See [DEPLOY.md](DEPLOY.md) for the full CI/deploy model.

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

## Rendering: prerendered vs dynamic

The two render strategies, factually:

- **`prerender`** — build-time-known content is rendered to real HTML, so the page ships
  as markup (fast first paint, good SEO).
- **`dynamic`** — the page renders entirely on the client; the shipped HTML is an empty
  shell. Use when content depends on the user or live data and there's nothing
  meaningful to render at build time.

Like the deploy mode, this is a deliberate one-time choice, not a runtime switch — and
not one to default into. Decide it (or ask) up front.

### prerendered → dynamic (client-side rendering)

1. In `src/web/prerender.ts`, empty the entries: `export const entries: PrerenderEntry[] = [];`
   (The build then prerenders nothing; the page ships as an empty shell that renders on
   the client. `src/web/main.tsx` already handles this — it mounts fresh when there's no
   prerendered markup.)
2. Optional: in `src/web/index.html`, remove the `<!--app-html-->` comment from the root
   div (it's just an unused injection point now).
3. Optional: drop the prerender step from `scripts/build.mjs` (the `prerender.mjs` line)
   and `tests/machinery`/app prerender tests, if you want a leaner build.

### dynamic → prerendered

Reverse it: restore the entry in `src/web/prerender.ts`
(`[{ html: 'index.html', element: createElement(App) }]`) and the prerender build step.
Keep prerendered content limited to what's known at build time.
