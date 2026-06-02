import express, { type Express } from 'express';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PORT } from './config.js';
// SPINUP:server-only:start
import { registerRoutes } from './routes/index.js';
// SPINUP:server-only:end

// The built frontend always lives in dist/ at the app root, regardless of whether
// this file runs from source (dev) or compiled (prod), so resolve it from the
// working directory rather than this file's location.
const distDir = resolve(process.cwd(), 'dist');

/** Builds the Express app that serves the built frontend from dist/. */
export function createApp(): Express {
  const app = express();

  // SPINUP:server-only:start
  registerRoutes(app);
  // SPINUP:server-only:end

  app.use(express.static(distDir));

  // SPA fallback: serve index.html for any unmatched GET so client routing works.
  // Express 5 requires a named wildcard rather than a bare "*".
  app.get('/*splat', (_req, res) => {
    res.sendFile('index.html', { root: distDir });
  });

  return app;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  createApp().listen(PORT, () => {
    console.log(`Listening on http://localhost:${PORT}`);
  });
}
