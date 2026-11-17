# web-react

A web front end template: Vite + React + TypeScript, built to static files, with Vitest, ESLint and
Prettier, on Node 24. It is one of the templates the snackbyte-base hub composes an app from; in an
app it becomes the `web/` folder.

It stands on its own: it installs, runs and passes its own gate without the hub or any other
template, so it can move into a repository of its own unchanged.

## Choices it resolves at spin-up

`node scripts/init.mjs --render=<prerender|dynamic> --api=<yes|no> --name=<app-name>`

- `--render`: `prerender` renders build-time-known content to real HTML at build (fast first paint,
  good SEO); `dynamic` renders in the browser and drops the prerender step.
- `--api`: `yes` keeps the dev server's `/api` proxy to `API_URL`, for an app whose server has an
  API; `no` removes it.
- `--name`: the page title, the package name, and the app's 1Password item in `.env`.

The hub passes these. Run alone, after the resolver: remove the files `template.json` lists under
`scaffolding`, plus `template.json` and this README, and rename `README.app.md` to `README.md`.

## Working on the template

```bash
npm ci
npm run check:all   # format, lint, typecheck, env files, tests
npm run dev         # the dev server
npm run build       # dist/
```

`tests/app/` ships with every app; `tests/machinery/` proves the template's own plumbing (the
resolver, the build-time identity, the lookup of `.env` and `environments.json`) and is removed at
spin-up.

## Files it shares with other templates

`environments.json`, `.nvmrc`, and `scripts/{load-env,resolve-env,check-env-files}.mjs` with
`scripts/lib/{env-guard,find-up-one}.mjs` are identical copies of the same files in other templates
(the hub's tests keep them identical). Change them everywhere at once.
