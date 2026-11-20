# Quickstart: validating the template hub

Runnable checks that prove the feature, in the order the work lands. Contracts:
[hub-cli](contracts/hub-cli.md), [template-manifest](contracts/template-manifest.md),
[server-contract](contracts/server-contract.md), [image-contract](contracts/image-contract.md).

## Prerequisites

Node 24 (`.nvmrc`), the .NET 11 SDK (`dotnet --list-sdks` shows an `11.0.` line), and Docker for the
opt-in image check only.

## 1. snackbyte-base's own gate

From the repo root: `npm ci`, `npm run setup` (installs every template), `npm run check:all`.
Expected: the hub's format, lint, typecheck, env-file check and tests pass, then every template's own
gate. This is what CI runs.

## 2. Each template alone (SC-003)

Copy one template folder into an empty directory, run its manifest's `setup` and `check` with
`{dir}` replaced by `.`. Expected: green, for each of the four. (The hub test
`templates.test.ts` also checks that no template names a sibling or the hub.)

## 3. Compose a React + C# app (US1, SC-001)

In a scratch copy of the repo:

1. `npm run init -- --api=dotnet --render=prerender --name=demo`
2. `npm ci && npm run setup`
3. `npm run check:all` — expected: the env-file check, the web gate, and the C# gate (format, build,
   tests) all pass.
4. `npm run dev`, then request `http://localhost:5173/api/health` — expected: JSON from the C# API
   through the web dev server's proxy.
5. `npm run build && PORT=8090 npm start`, then request `/` (prerendered HTML), `/api/health`,
   `/api/version` (`environment: "local"`), `/anything` (the page) — expected as the
   [server contract](contracts/server-contract.md) says.

## 4. Every combination (US2, SC-002)

`hub/tests/compose.test.ts` composes {node, dotnet, none} × {prerender, dynamic}, builds, starts and
asserts the server contract, the render strategy, the stamp, the root `.env`, the root scripts, and
that no hub scaffolding remains. It runs inside step 1.

## 5. The image (US3, SC-004)

`npm run e2e:image` (opt-in, needs Docker): for each API choice (`node`, `dotnet`, `none`), composes
an app in a scratch directory, builds its image twice (`APP_ENV_NAME=staging` and `production`, with `APP_VERSION`, `BUILD_GIT_COMMIT`,
`BUILD_DATE`), runs each with `PORT` set, and checks: the page; the chip present for staging and
absent for production; `/api/version` reporting the version and environment (or, with no API, `/api/`
falling through to the page); `X-Robots-Tag: noindex`
for staging only; the container user is not root.

## 6. The one step left: deploy (US3, SC-005)

Deploying is the Cloud Run deploy template's existing path, unchanged: `cloudbuild.yaml` builds the
app's root `Dockerfile` with the environment and version as build arguments, pushes the image and
deploys it by digest. The image it builds is the one `npm run e2e:image` checks locally.

For a composed React + C# app, once it is in its own repo and its per-app GCP pieces exist
(`GCP-SETUP.md` in project-setup: the Cloud Run runtime service account for the environment, and the
deployer allowed to act as it), the step is one Cloud Build submit from the app's root. The project is
`snackbyte-apps`; the other values are the app's and only Jeff holds them:

- `SERVICE` — the Cloud Run service name (the app's name, e.g. `demo`, or `demo-staging`).
- `REGION` — the region the service runs in (e.g. `us-central1`).
- `ENV_NAME` — `staging` or `production` (an entry in `environments.json`).
- `RUN_SA` — the runtime service account email for that environment
  (`<app>-stg-runtime@snackbyte-apps.iam.gserviceaccount.com` or `<app>-prod-runtime@…`).
- `DEPLOY_SA` — the deployer service account email.
- `TAG` — the version tag being deployed (e.g. `v0.1.0-dev`).

```bash
cd "${APP_DIR:?set APP_DIR to the composed app's root}" && ~/.claude/bin/run demo-deploy gcloud builds submit --config=cloudbuild.yaml --substitutions="TAG_NAME=${TAG:?set TAG},SHORT_SHA=$(git rev-parse --short HEAD),_SERVICE=${SERVICE:?set SERVICE},_REGION=${REGION:?set REGION},_APP_ENV_NAME=${ENV_NAME:?set ENV_NAME},_RUN_SA=${RUN_SA:?set RUN_SA}" --service-account="projects/snackbyte-apps/serviceAccounts/${DEPLOY_SA:?set DEPLOY_SA}" --default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET --project=snackbyte-apps --region="${REGION}" .
```

After it: `curl -sI https://<host>/` shows the page (with `X-Robots-Tag: noindex` on staging), and
`https://<host>/api/version` reports the tag and the environment. A first deploy also needs the
one-time `allUsers` invoker grant and the load balancer host rule (`GCP-SETUP.md` §4–§5), or the host
answers 403 or not at all.

## 7. Refusals (US5)

`npm run init` without `--api`, without `--render`, without `--name`, or with an unknown value:
expected non-zero exit, a message naming the problem and the accepted values, and `git status` clean.
