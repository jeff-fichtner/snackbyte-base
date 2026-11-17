import express, { type Express } from 'express';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PORT } from './config.js';
import { BAKED } from './env.generated.js';
// SPINUP:api-only:start
import { registerRoutes } from './routes/index.js';
// SPINUP:api-only:end

/**
 * Where the built web app sits in production: `public/` in the folder the server runs from, whether
 * this file runs from source (dev) or compiled (prod).
 */
const productionWebRoot = resolve(process.cwd(), 'public');

/** Builds the Express app that serves the built web app from `webRoot`. */
export function createApp(webRoot: string = productionWebRoot): Express {
  const app = express();

  // A non-public environment (e.g. staging) is publicly reachable — it serves exactly like
  // production — but must not be indexed by search engines, or it competes with production as
  // duplicate content. Keyed on the BAKED environment's `noindex` facet (decided at build from
  // environments.json), so an environment that opts into noindex emits the header and a public
  // environment does not. Registered before any route/static so it covers every response.
  app.use((_req, res, next) => {
    if (BAKED.noindex) res.set('X-Robots-Tag', 'noindex');
    next();
  });
  // SPINUP:api-only:start

  registerRoutes(app);
  // SPINUP:api-only:end

  app.use(express.static(webRoot));

  // SPA fallback: serve index.html for any unmatched GET so client routing works.
  // Express 5 requires a named wildcard rather than a bare "*".
  app.get('/*splat', (_req, res) => {
    res.sendFile('index.html', { root: webRoot });
  });

  return app;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  createApp().listen(PORT, () => {
    console.log(`Listening on http://localhost:${PORT}`);
  });
}
