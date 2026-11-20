# Research: Template Hub

Decisions behind the plan. Each: what was chosen, why, what else was considered. The spec's
`## Decisions` section is the plain-words version for Jeff's tour; this file keeps the technical
reasoning.

## R1 — Hub shape: in-place composition from template folders

**Decision**: The spin-up flow stays in place, as today: the app starts as a copy of snackbyte-base
(clone or "Use this template"), and `npm run init` composes it where it stands — moving
`templates/<chosen>` to `web/` and `server/`, writing root files, deleting the rest.

**Rationale**: It keeps the template stamp's version finding exactly as it is (the app's first commit
holds the hub's tree, so the release whose tree matches is found as today), keeps one familiar
command, and needs no network at spin-up. When templates move into their own repos later, only the
step that obtains a template changes (fetch instead of move); manifests and resolvers do not.

**Alternatives**: a generator that writes a new app into an empty directory from the hub (breaks the
stamp's first-commit matching and needs the hub installed somewhere first); git submodules or
subtrees per part (an app would carry template history and update mechanics it never uses).

## R2 — Template manifest with root-relative commands

**Decision**: Each template has `template.json` (see [contracts/template-manifest.md]). Commands are
written from the root of whatever holds the template, with `{dir}` standing for the template's
folder: `npm --prefix {dir} run check:all`, `dotnet test {dir}`. The hub substitutes
`templates/<id>` when it runs a template's gate in snackbyte-base, and the part's folder (`web`,
`server`) when it writes a composed app's root scripts.

**Rationale**: One description serves both places a template is driven from: snackbyte-base's own
gate and a composed app's root scripts. Every command stays a plain shell command a person can read in
the app's `package.json`. Commands written from inside the folder would need a `cd`, which npm scripts
cannot do portably.

**Alternatives**: hard-coding each stack's commands in the hub (the hub would have to change for
every template change; templates would not be self-describing); a JS plugin per template (code
where data suffices).

## R3 — Composed layout: `web/` + `server/` + root

**Decision**: As the spec's Context fact 3. Root package manifest has no dependencies; its lockfile
is written so `npm ci` succeeds.

**Rationale**: A .NET solution cannot be an npm package, so a merged root is impossible for the C#
combination; using the same layout for every combination keeps the docs, root scripts and container
recipes uniform. `server/` is accurate for all three API choices (the server serves the web build in
every case).

**Alternatives**: npm workspaces for the Node parts (hoists binaries away from
`<part>/node_modules/.bin`, where every template script looks); `api/` (wrong for an app with no API).

## R4 — "No API" composes server-node without its API

**Decision**: `--api=none` resolves server-node with `--api=no`, which removes `src/routes/`, its
registration and its dev process — today's static mode.

**Rationale**: Byte-for-byte today's behavior, including the noindex header for non-public
environments, with no new serving mechanism.

**Alternatives**: an nginx image (the noindex rule would need re-implementing in nginx config keyed
on a build arg; a second image recipe to maintain); a static host (a new deploy target, out of scope).

## R5 — App-level `.env` and manifest; two-candidate lookup

**Decision**: Each Node template resolves `<part>/.env` then `<part>/../.env` for dotenv, and
`<part>/environments.json` then `<part>/../environments.json` for the manifest, via one small helper
(`scripts/lib/find-up-one.mjs`). The C# template does the same for the manifest in MSBuild
(`Directory.Build.props`), and reads no `.env` and carries none (the root dev command passes the environment; run alone,
`PORT` defaults and a secret comes through `op run --env-file=<file> -- dotnet run`). The hub writes the root `.env` and copies
the root manifest, and deletes the parts' copies.

**Rationale**: Standalone templates work with their own copies; composed parts read the app's single
copies; no source is rewritten at compose; the lookup cannot wander (exactly two candidates, both
inside the app). The manifest missing from both fails the build naming both paths.

**Alternatives**: unbounded walk-up (could find an unrelated file above a nested app); the hub
rewriting a path constant in each part (edits template source at compose, and the rewrite can silently
miss); a copy per part (drift).

## R6 — Dev: root `.env` loaded once, `dev:*` scripts run together

**Decision**: The composed root's `scripts/dev.mjs` loads `.env` with Node's built-in
`process.loadEnvFile` (no dependency at the root), refuses unresolved `op://` references with the same
guard the templates use, and runs every root script named `dev:<part>` concurrently via `npm run`,
stopping all when one exits. The web dev server proxies `/api` to `API_URL`, which the root `.env`
sets to the server's `PORT`.

**Rationale**: One command, one `.env`, one 1Password item per app (the existing convention). The web
part needs `API_URL` instead of importing the server's `PORT` module (it can no longer reach it). The
built-in loader has no `${VAR}` expansion, so the root `.env` writes the URL literally beside `PORT`;
both lines sit together in the file and are declared config.

**Alternatives**: `concurrently` or `npm-run-all` at the root (a root dependency and install for one
feature); separate terminals (today's single `npm run dev` would regress).

## R7 — Web dev proxy only in apps with an API, required only by the dev server

**Decision**: web-react's `vite.config.ts` keeps the proxy inside a `SPINUP:api-only` marker block
(resolved by the web resolver's `--api=yes|no`). Inside it, `API_URL` is read only when Vite runs the
dev server (`command === 'serve'`, not preview, not Vitest's `test` mode) and its absence throws,
naming `API_URL` and the root `.env`.

**Rationale**: Fail loud where the value is needed, and nowhere else: production builds, the image
build and the tests do not proxy anything.

## R8 — The C# server: identity, port, static files

**Decision**:
- **Identity**: `Directory.Build.props` reads `APP_ENV_NAME` from the build's environment (MSBuild
  exposes environment variables as properties), bakes it into the API assembly as
  `AssemblyMetadata("AppEnvName", …)`, copies the resolved manifest next to the build output, and
  fails the build when a non-empty `APP_ENV_NAME` does not appear as a `name` in the manifest. At
  startup `AppEnvironment` reads the baked name (empty → the `local` identity, mirroring Node's
  `LOCAL`) and its facets from the copied manifest, failing on an unknown name. It is registered as a
  singleton; tests replace it.
- **Port**: `Port.Read(PORT)` with the Node rule (unset → 8080; set → whole number 1–65535 or a
  startup error naming `PORT`); the app binds `http://0.0.0.0:{port}`. The C# image clears
  `ASPNETCORE_HTTP_PORTS` so the runtime image's own default does not compete.
- **Static files**: `UseStaticFiles()` from the web root (`wwwroot` beside the published app) and
  `MapFallbackToFile("index.html")`; with no web root, the fallback is a 404 and the API still works.
- **noindex**: middleware ahead of everything sets `X-Robots-Tag: noindex` when the identity's
  `Noindex` is true.
- **Version**: `{ number, commit, buildDate, environment }`; `number` is `APP_VERSION` (or `0.0.0`)
  in the Production host environment and `0.0.0-dev` otherwise, matching Node's build/dev split
  (ASP.NET's host environment is Production unless a launch profile says Development).

**Rationale**: Same contract as the Node server ([contracts/server-contract.md]) using only what ASP.NET
Core and MSBuild provide; the build-time failure for an unknown environment matches Node's
`resolve-env` throwing at build.

**Alternatives**: reading `APP_ENV_NAME` at runtime from the image environment (relabelable at deploy;
the existing design bakes identity at build); generating a C# source file at build (more machinery
than an assembly attribute).

## R9 — C# toolchain and gate

**Decision** (as ruled 2026-11-18): `global.json` pins SDK `11.0.100` with `rollForward:
latestFeature` (any 11.0 SDK), and is the one .NET setting: `Directory.Build.props` derives the target
framework (`net11.0`) and the test host's version from it, and sets nullable, implicit usings, `TreatWarningsAsErrors`; the gate
is `dotnet format <dir> --verify-no-changes`, `dotnet build <dir>` (warnings fail it), `dotnet test
<dir> --no-build`. Packages: `Microsoft.AspNetCore.Mvc.Testing` at the newest patch of the release,
`Microsoft.NET.Test.Sdk`, `xunit` 2.9.x and `xunit.runner.visualstudio` pinned to exact versions.

**Rationale**: The SDK's own formatter and analyzers; no extra tools to install. The release
lives in one setting so a client app can move to an older release (e.g. .NET 8) by changing it, and
the template moves to each new release the same way; the image recipe's `DOTNET_RELEASE` names the
same release, and a mismatch stops the image build at restore.

## R10 — Container recipes are the hub's, per server stack

**Decision**: `hub/files/Dockerfile.node` and `hub/files/Dockerfile.dotnet`, placed as the app's root
`Dockerfile`. Node: one build stage installs and builds both parts, the runtime stage holds the
server's production dependencies, its compiled output and the web build in `public/`, runs as `node`.
C#: a Node stage builds the web part, an SDK stage publishes the API (with `APP_ENV_NAME` in its
environment), the ASP.NET runtime stage holds the published app with the web build in `wwwroot/`,
runs as the image's `app` user. Both take `APP_ENV_NAME`, `APP_VERSION`, `BUILD_GIT_COMMIT`,
`BUILD_DATE` ([contracts/image-contract.md]). Image tags are pinned to exact patch versions.

**Rationale**: The image depends on the combination, not the target (spec Decision 3); every target
the deploy templates will cover runs the same image.

## R11 — The deploy question

**Decision**: Deploy is its own template per target. This feature moves today's Cloud Run files
(`cloudbuild.yaml`, its test, the per-app deploy half of `DEPLOY.md`) into
`templates/deploy-cloud-run/` without behavior changes; the hub places `cloudbuild.yaml` and
`DEPLOY.md` at the app root.

**Rationale**: Three things vary independently: what the front end is built with, what the server is
built with, and where the app runs. Putting deploy inside the server templates would repeat each
target per server stack (Cloud Run × Node, Cloud Run × C#, Azure × Node, …); putting the image inside
the deploy template would repeat each server stack per target. A per-target deploy template consuming
a fixed image contract keeps each concern in one place. The Azure option (#65c2c1) then lands as
`templates/deploy-azure`, consuming the same image, and a static host would consume the web build
directly. The setup runbook for each target stays in project-setup; the deploy template links to it.

**Alternatives**: deploy inside server templates; deploy inside the hub; keeping `cloudbuild.yaml` at
the hub root until a second target exists (smaller now, but the next target would then also have to
restructure, and #65c2c1 explicitly waits on where deploy lands).

## R12 — snackbyte-base's gate and CI

**Decision**: Root scripts: `setup` (install every template via its manifest's `setup`), `check:hub`
(format, lint, typecheck of `hub/`, `check:env`, hub tests), `check:templates` (every template's
`check` via its manifest), `check:all` (both). CI: `actions/setup-node`, `actions/setup-dotnet`
(SHA-pinned, v6.1.0 at `0f4a354dd5547a28c70b7853dbd95d5b67886e73`, reading
`templates/server-dotnet/global.json`), `npm ci`, `npm run setup`, `npm run check:all`, in both the
merge-gate and the push job. Dependabot gains npm entries for each Node template and a nuget entry for
the C# template.

**Rationale**: One gate locally and in CI; the release-flow Action keeps reading the root
`package.json` version and `environments.json`, unchanged.

## R13 — Composition tests: share one app per combination, symlink installs

**Decision**: `hub/tests/compose.test.ts` composes each of the six combinations once in a scratch copy
(beforeAll), symlinks each part's `node_modules` to the installed template's, builds with the root
`build`, starts with the root `start` on a unique port, and asserts behavior. The root `check:all` runs
inside the test for one combination per API choice. The C# combinations restore from the NuGet cache
(network on a cold cache).

**Rationale**: Real artifacts, real servers (today's approach), at a cost the gate can carry.
Symlinking avoids copying ~200 MB per combination.

## R14 — What stays out

**Decision**: no `--web=none`, no mobile, no plain web template, no new deploy target, no repos, no
publishing, no version bump, no stamp format change, Node stays 24.

**Rationale**: The spec's scope and the week's parking rules.

## The places that assume Google Cloud or TypeScript (#731762)

Request #731762 asks for this list so the AWS / Azure / .NET shaping starts from it. Direction
recorded (Jeff, 2026-11-11): Snackbyte deploys to AWS and Azure as well as Google Cloud, and builds
.NET beside TypeScript. This feature handles the .NET half (the C# server template) and gives deploy
targets their own template (R11). What still assumes one or the other, as of this feature:

**Google Cloud**

- `templates/deploy-cloud-run/cloudbuild.yaml` — Cloud Build steps, Artifact Registry image paths,
  `gcloud run deploy` flags (`--ingress`, `--service-account`). Correctly target-specific now.
- `templates/deploy-cloud-run/DEPLOY.md` — Workload Identity Federation, the per-app deploy job,
  Cloud SQL notes, the load balancer, runtime service accounts. Target-specific.
- The image contract's `PORT` — injected by Cloud Run; Azure Container Apps and AWS App Runner set a
  target port in their own config instead, so the deploy template for those targets sets `PORT`
  explicitly (both servers read it).
- `cloudbuild.yaml` sets `NODE_ENV=production` on the service: meaningful to the Node server only;
  harmless to the C# server (which reads ASP.NET's host environment, Production by default). A
  target-neutral name would be a later cleanup.
- Comments in `server-node/src/config.ts` and `server-dotnet`'s port reader name Cloud Run as the
  platform that sets `PORT`.
- project-setup's `GCP-SETUP.md` — the one-time hosting stand-up; an Azure or AWS runbook would sit
  beside it there.
- The constitution's Principle V ("Cloud Run default") and Technology Stack ("Host: Google Cloud").

**TypeScript / Node**

- The hub itself: its resolver, root scripts and composed-app root scripts are Node (`.mjs`), and the
  composed app's root has a `package.json`. Acceptable while every app has a web part (which needs
  Node); an API-only C# app would carry Node only for these scripts.
- The env-file gate (`check-env-files.mjs`) and the `op://` startup guard are Node; the C# server has
  no `.env` loader (the root dev command passes the environment).
- The release flow (snackbyte-release-flow-action) reads `MAJOR.MINOR` from `package.json`: a composed
  app keeps a root `package.json` for that reason.
- `environments.json` is read by Node scripts in the Node templates and by MSBuild + `AppEnvironment`
  in the C# template: two implementations of one rule, both tested.
- `cloudbuild.yaml`'s `NODE_ENV` (above).
