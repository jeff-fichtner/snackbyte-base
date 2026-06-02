# Spin-up handoff

You just created a repo from the snackbyte-base template. This file walks you (or an
agent) through resolving it into a clean, single-mode app. It is removed automatically
when you run `init`.

## 1. Install

```bash
nvm use        # Node 24 LTS
npm install
```

## 2. Choose the deploy mode and resolve

Decide what this app is:

- **`server`** — Express serves the frontend AND exposes an API under `/api`. Most
  apps. Keeps `src/routes/` and a `/api/health` liveness endpoint.
- **`static`** — a prerendered frontend with no API. Smaller; no `src/routes/`, no dev
  API proxy.

Then run the resolver:

```bash
npm run init -- --mode=<static|server> --name=<your-app-name>
```

This bakes the choice into the source, deletes the other mode's code and all template
scaffolding (this file, the init script, the template README, the machinery tests),
points the test suite at `tests/app/`, and replaces this README with the app's own.
After it runs there is no "mode" concept and no template fingerprint left — the repo is
your app.

## 3. Verify

```bash
npm run check:all   # format + lint + typecheck + tests
npm run dev         # bring it up
```

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
