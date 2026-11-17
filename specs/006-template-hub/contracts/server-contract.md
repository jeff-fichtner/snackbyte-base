# Contract: every server template

What a web part, a deploy template and the app's own code can rely on, whichever server the app has.
server-node and server-dotnet both meet it; their tests assert it.

## HTTP

| Request | Response |
|---------|----------|
| `GET /api/health` (with an API) | `200`, JSON `{ "status": "ok", "uptime": <seconds>, "timestamp": "<ISO 8601>" }` |
| `GET /api/version` (with an API) | `200`, JSON `{ "number", "commit", "buildDate", "environment" }` |
| `GET /` and any path that is not a file or a route | the web build's `index.html` (single-page fallback), including unknown `/api/...` paths |
| a file in the web build | that file |
| every response, when the baked environment has `noindex: true` | header `X-Robots-Tag: noindex` |

`/api/version` fields: `number` is `APP_VERSION` (or `0.0.0` when unset) in a production run and
`0.0.0-dev` otherwise, where "a production run" is each stack's own notion: for the Node server,
`NODE_ENV=production` or `CI=true` (both set in the image and by the Cloud Run deploy); for the C#
server, ASP.NET Core's Production host environment (the default outside a Development launch
profile). In the image both report `APP_VERSION`; a local root `start` reports `0.0.0-dev` (Node) or
`0.0.0` (C#), and the composition tests assert each; `commit` is `BUILD_GIT_COMMIT` or `dev`; `buildDate` is `BUILD_DATE` or `dev`;
`environment` is the baked environment name.

With no API (server-node `--api=no`), `/api/...` is not special: it falls through to `index.html`.

With no web build present, the fallback is a 404; the API still answers.

## Configuration it reads

| Variable | When | Rule |
|----------|------|------|
| `PORT` | startup | unset → 8080; set → a whole number 1–65535, else startup fails naming `PORT` |
| `APP_ENV_NAME` | build | names a manifest entry, baked into the build; unset → `local`; unknown → the build fails naming it and the known names |
| `APP_VERSION`, `BUILD_GIT_COMMIT`, `BUILD_DATE` | runtime | reported by `/api/version` |

## Identity accessor for server code

Node: `env` from `src/env.ts` (`name`, `isPublicFace`, `is(name)`). C#: the `AppEnvironment` service
(`Name`, `IsPublicFace`, `Noindex`, `Is(name)`), injected.
