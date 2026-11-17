# Tasks: Template Hub

**Input**: Design documents from `specs/006-template-hub/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. Jeff's testing discipline asks for tests alongside every unit and an end-to-end
pass before hand-off; the spec's success criteria are test outcomes.

**Organization**: Phases follow the PRs in plan.md. User Story 2 (existing combinations through the
hub) is built before User Story 1 (React + C#) because the C# server slots into the structure the
split creates; both are P1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task serves (US1–US5)

## Path conventions

`templates/<id>/` for a template, `hub/` for the hub, repo root for the hub repo's own tooling.

## Where today's root files go

| Today | After the split |
|-------|-----------------|
| `src/web/*` | `templates/web-react/src/*` (`index.html` → `templates/web-react/index.html`) — `git mv` |
| `src/{server,config,env,env.generated,environments,version}.ts`, `src/routes/` | `templates/server-node/src/` — `git mv` |
| `scripts/{dev,build}.mjs` | split: web halves → `templates/web-react/scripts/` (`git mv`), server halves → `templates/server-node/scripts/` (new files) |
| `scripts/prerender.mjs` | `templates/web-react/scripts/` — `git mv` |
| `scripts/{resolve-env,load-env,check-env-files}.mjs`, `scripts/lib/env-guard.*` | `git mv` to `templates/web-react/scripts/`; identical copies in `templates/server-node/scripts/`; `check-env-files.mjs` and `env-guard.mjs` also copied to `hub/files/scripts/` |
| `scripts/init.mjs` | replaced by `hub/init.mjs` + `hub/lib/` (stamp logic moved to `hub/lib/stamp.mjs`) and the two template resolvers |
| `vite.config.ts`, `tsconfig.web.json` | `templates/web-react/{vite.config.ts,tsconfig.json}` — `git mv` + edit |
| `tsconfig.build.json` | `templates/server-node/tsconfig.build.json` — `git mv` + edit |
| `tsconfig.json`, `eslint.config.js`, `config/` | stay as the hub's tooling (edited); copies adapted into each Node template |
| `Dockerfile`, `.dockerignore` | `hub/files/Dockerfile.node`, `hub/files/dockerignore` — `git mv` + edit |
| `README.app.md` | `hub/files/README.app.md` (the composed app's README) — `git mv` + edit |
| `cloudbuild.yaml`, `DEPLOY.md` (whole file) | `templates/deploy-cloud-run/` — `git mv`; DEPLOY.md edited to be server-stack neutral |
| `.env` | `templates/web-react/.env` and `templates/server-node/.env` (per template); the hub root keeps none |
| `.nvmrc`, `environments.json` | stay at the root (the hub's own) and are copied into each template that reads them |
| `tests/app/example.test.tsx` | `templates/web-react/tests/app/` — `git mv` |
| `tests/app/{server-smoke,static-smoke}.test.ts` | `templates/server-node/tests/app/` — `git mv` + edit (fixture web root) |
| `tests/machinery/{chip,prerender}.test.ts` | `templates/web-react/tests/machinery/` — `git mv` |
| `tests/machinery/{environment}.test.ts` | `templates/server-node/tests/machinery/` — `git mv` |
| `tests/machinery/env-accessor.test.ts` | split: web half → web-react, server half → server-node (machinery) |
| `tests/machinery/env-guard.test.ts` | `templates/web-react/tests/app/` (shipped tier, as today after spin-up) — `git mv`; copy in server-node |
| `tests/machinery/config.test.ts` | `templates/server-node/tests/app/` (shipped tier) — `git mv` |
| `tests/machinery/cloudbuild.test.ts` | `templates/deploy-cloud-run/tests/` — `git mv`; its root-Dockerfile assertion moves to a hub test |
| `tests/machinery/actions-pinned.test.ts` | `hub/tests/` — `git mv` + paths |
| `tests/machinery/init.test.ts` | replaced by `hub/tests/{compose,stamp,refuse}.test.ts` and the template resolver tests |
| `package.json`, `package-lock.json` | the hub's own (edited, pruned); each Node template gets its own |

A hub test asserts the hub root holds only hub files afterwards (T033).

---

## Phase 1: Setup (spec PR)

- [x] T001 Amend the constitution to 3.0.0 (Principle I → templates composed at spin-up; Principle V
  wording → the deploy path lives in a deploy template; Principle VII → per-template runtime pin and
  gate; Technology Stack adds C#/.NET 8, ASP.NET Core minimal API, xUnit) with a Sync Impact Report in
  `.specify/memory/constitution.md`
- [x] T002 Point the active-feature block at this spec in `CLAUDE.md` (between the SPECKIT markers)
- [x] T003 Run `/speckit-analyze` over spec, plan and tasks; fix what is unambiguous
- [ ] T004 Run `npm run check:all` on the spec branch; open the spec PR against `dev` with
  `## Decisions for Jeff`; merge once green (docs only, per the week's brief)

---

## Phase 2: Foundational — the split (split PR; blocks every story)

**Purpose**: today's root becomes standalone templates and a hub that can compose them. Order:
web-react first (it receives the shared scripts by `git mv`), then server-node (copies them), then
deploy-cloud-run, then the hub.

### Template: web-react

- [ ] T005 `git mv` the front end and the shared scripts into `templates/web-react/` per the table
  above, flattening `src/web` → `src`
- [ ] T006 Write `templates/web-react/package.json` (React, Vite, Vitest, ESLint, Prettier, TS,
  jsdom, tsx, dotenv) and derive its `package-lock.json` from today's lockfile by pruning, keeping
  every remaining version unchanged
- [ ] T007 [P] Add `templates/web-react/{tsconfig.json,eslint.config.js,config/,.nvmrc,.gitignore,.env,environments.json}`
- [ ] T008 Add `templates/web-react/scripts/lib/find-up-one.mjs` (own folder, then parent; the
  manifest missing from both throws naming both) and use it in
  `templates/web-react/scripts/{load-env,resolve-env}.mjs`
- [ ] T009 Rewrite `templates/web-react/vite.config.ts`: root at the template, `SPINUP:api-only`
  block with the `/api` proxy to `API_URL`, required only for the dev server
- [ ] T010 Rewrite `templates/web-react/scripts/{dev,build}.mjs`: dev runs Vite only, passing
  `npm run dev -- <args>` through (#8940f5); build runs Vite build and, in a `SPINUP:prerender-only`
  block, the prerender step; no server compile
- [ ] T011 Write the web resolver `templates/web-react/scripts/init.mjs` (`--render`, `--api=yes|no`,
  `--name`): markers, dynamic-only deletions, page title, package name, `.env` item name and
  `API_URL` line, removal of its scaffolding; marker blocks laid out so removal leaves prettier-clean
  source with no formatter run
- [ ] T012 [P] Adapt the moved web tests (`tests/app/{example,env-guard}`,
  `tests/machinery/{chip,prerender}`, the web half of `env-accessor`)
- [ ] T013 Write `templates/web-react/tests/machinery/init.test.ts` (render × api in scratch copies:
  build, render strategy, proxy present only with an API via the native config loader, scaffolding
  removed, prettier-clean) and `tests/machinery/lookup.test.ts` (own-then-parent for `.env` and the
  manifest; the manifest missing from both throws naming both paths; an unset `API_URL` stops the dev
  server config naming it; build and tests need no `API_URL`)
- [ ] T014 [P] Write `templates/web-react/{template.json,README.md,README.app.md}`
- [ ] T015 Run the web-react gate green

### Template: server-node

- [ ] T016 `git mv` the server into `templates/server-node/` per the table; copy the shared scripts
  (`resolve-env`, `load-env`, `check-env-files`, `lib/env-guard.*`, `lib/find-up-one.mjs`) from
  web-react
- [ ] T017 Write `templates/server-node/package.json` (Express; tsx, TS, Vitest, supertest, ESLint,
  Prettier, dotenv) and its pruned `package-lock.json`
- [ ] T018 [P] Add `templates/server-node/{tsconfig.json,vitest.config.ts,eslint.config.js,config/,.nvmrc,.gitignore,.env,environments.json}`
- [ ] T019 Change `templates/server-node/src/server.ts` to `createApp(webRoot)` serving `public/`
  (from the working directory) with the SPA fallback; keep the `SPINUP:server-only` blocks; build
  output `dist/server.js`
- [ ] T020 Rewrite `templates/server-node/scripts/{dev,build}.mjs` (dev: `tsx watch src/server.ts`;
  build: bake `src/env.generated.ts`, `tsc`)
- [ ] T021 Write the server resolver `templates/server-node/scripts/init.mjs` (`--api=yes|no`,
  `--name`): routes and markers, drop `dev` from its manifest when `--api=no`, its scaffolding
- [ ] T022 [P] Adapt the moved server tests (`tests/app/{server-smoke,static-smoke,config,env-guard}`
  with a fixture web root; `tests/machinery/environment`, the server half of `env-accessor`)
- [ ] T023 Write `templates/server-node/tests/machinery/{init,lookup}.test.ts` (api yes/no: routes,
  dev manifest entry, prettier-clean, build and serve; own-then-parent lookup)
- [ ] T024 [P] Write `templates/server-node/{template.json,README.md,README.app.md}`
- [ ] T025 Run the server-node gate green

### Template: deploy-cloud-run

- [ ] T026 `git mv cloudbuild.yaml DEPLOY.md tests/machinery/cloudbuild.test.ts` into
  `templates/deploy-cloud-run/`; make DEPLOY.md server-stack neutral where it describes the image;
  move the test's root-Dockerfile assertion to `hub/tests/dockerfiles.test.ts`
- [ ] T027 [P] Write `templates/deploy-cloud-run/{package.json,package-lock.json,vitest.config.ts,template.json,README.md}`
  and run its gate green

### Hub

- [ ] T028 Write `hub/registry.json` and `hub/lib/manifest.mjs` (read + validate manifests, `{dir}`
  substitution)
- [ ] T029 Write `hub/lib/stamp.mjs` (today's version finding, moved from `scripts/init.mjs`, run
  before anything moves)
- [ ] T030 Write `hub/files/scripts/{dev,copy-web,check-env-files}.mjs`, `hub/files/scripts/lib/env-guard.mjs`
- [ ] T031 [P] `git mv` and adapt `hub/files/{Dockerfile.node,dockerignore,README.app.md}` (the
  README gives the CI install order: root `npm ci`, `setup`, check) and write `hub/files/gitignore`
- [ ] T032 Write `hub/init.mjs` and `hub/lib/compose.mjs` per [contracts/hub-cli.md]
- [ ] T033 Rewrite the hub repo's root tooling (`package.json` with init, setup, check:hub,
  check:templates, check:all, e2e:image, spec:html; hub-only dev dependencies; pruned lockfile;
  `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`, `config/`, `.gitignore`,
  `config/.prettierignore`) and write `hub/tests/copies.test.ts`: identical copies of
  `environments.json` (root, web-react, server-node, server-dotnet), `.nvmrc` (root, web-react,
  server-node), `env-guard.mjs` and `check-env-files.mjs` (web-react, server-node, `hub/files`),
  `find-up-one.mjs`, `load-env.mjs`, `resolve-env.mjs` (web-react, server-node); and that the hub root
  holds only hub files
- [ ] T034 [P] `git mv tests/machinery/actions-pinned.test.ts hub/tests/` and repoint it
- [ ] T035 Update `.github/workflows/ci-cd.yml` (`npm run setup` before the gate) and
  `.github/dependabot.yml` (npm for each Node template); update the paths named in `CLAUDE.md`'s
  "Settled" section

**Checkpoint**: every template gate green; the hub resolver composes.

---

## Phase 3: User Story 2 — existing combinations through the hub (Priority: P1)

**Goal**: `--api=node|none` × `--render=prerender|dynamic` behave as today.

**Independent test**: `hub/tests/compose.test.ts` for the four Node combinations.

- [ ] T036 [US2] Write `hub/tests/compose.test.ts` for the four Node combinations: compose in a
  scratch copy, symlink installs, root `build`, root `start`, the server contract (including
  `/api/version`'s `number` per stack), render strategy, stamp, root `.env`, root scripts, no
  scaffolding, no spec-workflow references, no dangling doc links
- [ ] T037 [US2] Run root `check:all` inside the test for one combination per API choice, and start
  the root `dev` for `--api=node` and request `/api/health` through the web dev server
- [ ] T038 [P] [US2] Write `hub/tests/stamp.test.ts` (today's stamp cases against the hub resolver)
- [ ] T039 [P] [US2] Write `hub/tests/templates.test.ts` (manifests validate; no template file names
  `templates/`, `hub/`, a sibling template, or the spec workflow; every command except `resolve`
  uses `{dir}`) and `hub/tests/refuse.test.ts` (missing or unknown flags change nothing)
- [ ] T040 [US2] Write `hub/image-e2e.mjs` and the root `e2e:image` script for `--api=node` and
  `--api=none` (staging and production builds); run it and record the evidence in the split PR
- [ ] T041 [US2] Rewrite `SPIN-UP.md`, `README.md`, `SUBDIR-LAYOUT.md` for the hub
- [ ] T042 [US2] Copy each Node template and the deploy template alone into a scratch directory,
  `git init && git add -A`, run its `setup` and `check` with `{dir}` = `.`; record the result
- [ ] T043 [US2] Run `npm run check:all` at the hub root green; open the split PR (waits for Jeff)

---

## Phase 4: User Story 1 — React + C# (Priority: P1) 🎯 the request's done condition

**Goal**: `--api=dotnet` composes a React + C# app whose root check is green.

**Independent test**: quickstart §3.

- [ ] T044 [US1] Create `templates/server-dotnet/` (`Api.sln`, `global.json`,
  `Directory.Build.props` with the manifest lookup, `.editorconfig`, `.gitignore`,
  `environments.json`) from the validated prototype
- [ ] T045 [P] [US1] Write `templates/server-dotnet/src/Api/{Api.csproj,Program.cs,AppEnvironment.cs,Port.cs,VersionInfo.cs,Health.cs,Properties/launchSettings.json}`
  per the server contract (`APP_ENV_NAME` bake and build-time check in `Api.csproj`)
- [ ] T046 [P] [US1] Write `templates/server-dotnet/tests/Api.Tests/` (health, version, noindex,
  port, environment identity, static files and fallback)
- [ ] T047 [US1] Add a build-level test for the C# template: an unknown `APP_ENV_NAME` fails the build
  naming it; the manifest missing from both places fails naming them; a publish for `staging` bakes it
  (in `hub/tests/dotnet-build.test.ts`, since it drives `dotnet` from outside the solution)
- [ ] T048 [US1] Write `templates/server-dotnet/{template.json,README.md,README.app.md}`; run its gate
  green
- [ ] T049 [US1] Add `dotnet` to `hub/registry.json`; extend `hub/tests/compose.test.ts` with the two
  C# combinations (root `check:all` for one; root `dev` serving `/api/health` from the C# API through
  the web dev server)
- [ ] T050 [US1] Add `actions/setup-dotnet` (SHA-pinned, v6.1.0) to `.github/workflows/ci-cd.yml` and
  a nuget entry to `.github/dependabot.yml`
- [ ] T051 [US1] Extend `SPIN-UP.md`, `README.md`, `refuse.test.ts` and the standalone check (T042)
  to the C# template

---

## Phase 5: User Story 3 — one deployable image (Priority: P1)

**Goal**: the composed React + C# app builds into one image that meets the image contract.

**Independent test**: quickstart §5.

- [ ] T052 [US3] Write `hub/files/Dockerfile.dotnet` (Node stage for web, SDK stage publishing with
  `APP_ENV_NAME`, ASP.NET runtime with `wwwroot`, `USER app`, pinned tags) and extend
  `hub/tests/dockerfiles.test.ts` to it
- [ ] T053 [US3] Extend `e2e:image` to `--api=dotnet`; run all three; record the evidence in the C# PR
- [ ] T054 [US3] Write the remaining deploy step for Jeff into the C# PR body and
  `templates/deploy-cloud-run/DEPLOY.md`

---

## Phase 6: Polish

- [ ] T055 Run the whole gate and the image check one last time; update quickstart if a command
  changed
- [ ] T056 File the multi-part CI recipe with the release flow (`ops request
  snackbyte-release-flow-action …`), and close #731762 with the research list

---

## Dependencies & execution order

- Phase 1 → spec PR merged.
- Phase 2 blocks everything else. web-react (T005–T015) goes first because it receives the shared
  scripts by `git mv`; server-node (T016–T025) copies them; deploy (T026–T027) is independent; the hub
  (T028–T035) needs the three manifests.
- Phase 3 (US2, plus the US4/US5 checks for the Node templates) needs Phase 2. Phase 4 (US1) needs
  Phase 3's compose test. Phase 5 (US3) needs Phase 4.

## Parallel opportunities

Within Phase 2, deploy-cloud-run is independent of the two Node templates. Within Phase 4, the C# API
(T045) and its tests (T046) are separate projects.

## Implementation strategy

1. Spec PR (Phase 1) — merged once green.
2. Split PR (Phases 2–3) — the hub works for today's combinations; waits for Jeff.
3. C# PR (Phases 4–5) stacked on the split PR — the request's done condition and the deploy step;
   waits for Jeff.
4. Polish and follow-ups in their own PRs.
