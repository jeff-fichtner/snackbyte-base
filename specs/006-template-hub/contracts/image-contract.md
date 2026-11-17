# Contract: the app image

What a deploy template relies on, whichever parts were composed. The app's root `Dockerfile` (from
`hub/files/Dockerfile.<image>`) meets it; the Cloud Run deploy template's `cloudbuild.yaml` uses it.

| Item | Contract |
|------|----------|
| Build context | the app root |
| Build arguments | `APP_ENV_NAME` (the environment to bake; empty bakes `local`), `APP_VERSION`, `BUILD_GIT_COMMIT`, `BUILD_DATE` |
| Listens on | `PORT` (default 8080 in the image) |
| Serves | the server contract ([server-contract.md](server-contract.md)) |
| Runtime stage holds | the built server and the web build; no source, no `.env*`, no build toolchain |
| User | non-root (`node` for the Node image, `app` for the C# image) |
| Platform | `linux/amd64` (Cloud Run); the recipes pin exact base image versions |

Runtime environment a deploy may set: `APP_VERSION`, `BUILD_GIT_COMMIT`, `BUILD_DATE` (reported by
`/api/version`). Today's `cloudbuild.yaml` also sets `NODE_ENV=production`, which only the Node server
reads.
