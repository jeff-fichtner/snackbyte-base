# APP_NAME server

The server: Node + Express + TypeScript. In production it serves the built web app from `public/`
(and, when the app has one, the API under `/api`).

## Scripts

```bash
npm run dev          # the server, restarting on change
npm run build        # dist/
npm start            # run the built server (serves ./public)
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run typecheck    # tsc
npm test             # Vitest
npm run check:all    # format check + lint + typecheck + env files + tests
```

## How it fits

- **Environment identity.** The build reads `APP_ENV_NAME` and bakes that environment's entry from
  `environments.json` into `src/env.generated.ts`, so the server reports the environment its image
  was built for: at `/api/version`, through `src/env.ts` for server code, and with
  `X-Robots-Tag: noindex` on every response when the entry says so.
- **`PORT`.** The port it listens on: injected by the platform in production, 8080 when unset, and
  anything that is not a port stops startup naming it (`src/config.ts`).
- **`.env` and `environments.json`** are read from this folder, or, when this is the `server/` part
  of a larger app, from the app's root (the folder above).
