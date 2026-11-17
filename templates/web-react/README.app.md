# APP_NAME web

The front end: Vite + React + TypeScript, built to static files in `dist/`.

## Scripts

```bash
npm run dev          # the dev server
npm run build        # dist/
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run typecheck    # tsc
npm test             # Vitest
npm run check:all    # format check + lint + typecheck + env files + tests
```

## How it fits

- **Environment identity.** The build reads `APP_ENV_NAME` and bakes that environment's entry from
  `environments.json` into the bundle: `src/env.ts` for app code, and the version chip, which shows
  on every environment except the public face. With no `APP_ENV_NAME` (local development) it is the
  `local` identity.
- **`.env` and `environments.json`** are read from this folder, or, when this is the `web/` part of
  a larger app, from the app's root (the folder above). The app's root holds the one copy of each.
- **The API.** When the app's server has an API, the dev server forwards `/api` to `API_URL` (set in
  `.env`), so app code calls relative `/api` paths in development and production alike.
