# server-node

A server template: Node 24 + Express + TypeScript, with Vitest, ESLint and Prettier. It serves a
built web app and, when the app has one, an API under `/api`. It is one of the templates the
snackbyte-base hub composes an app from; in an app it becomes the `server/` folder, serving the
`web/` part's build. An app with no API gets this server with its API removed.

It stands on its own: it installs, runs and passes its own gate without the hub or any other
template, so it can move into a repository of its own unchanged.

## Choices it resolves at spin-up

`node scripts/init.mjs --api=<yes|no> --name=<app-name>`

- `--api`: `yes` keeps `src/routes/` (`/api/health`, `/api/version`), the 404 for an unknown path
  under `/api` (`{ "error": "Not found" }`, not the page) and the dev process; `no` removes them, so
  the server only serves the built web app, on every path.
- `--name`: the package name and the app's 1Password item in `.env`.

The hub passes these. Run alone, after the resolver: remove the files `template.json` lists under
`scaffolding`, plus `template.json` and this README, and rename `README.app.md` to `README.md`.

## Working on the template

```bash
npm ci
npm run check:all   # format, lint, typecheck, env files, tests
npm run dev         # the server, restarting on change
npm run build       # dist/
```

`tests/app/` ships with every app; `tests/machinery/` proves the template's own plumbing and is
removed at spin-up; `tests/no-api/` holds the smoke test the resolver puts in `tests/app/` when it
removes the API.

## Files it shares with other templates

`environments.json`, `.nvmrc`, and `scripts/{load-env,resolve-env,check-env-files}.mjs` with
`scripts/lib/{env-guard,find-up-one}.mjs` are identical copies of the same files in other templates
(the hub's tests keep them identical). Change them everywhere at once.
