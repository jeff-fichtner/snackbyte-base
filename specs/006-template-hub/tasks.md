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

---

## Phase 1: Setup (spec PR)

- [ ] T001 Amend the constitution to 3.0.0 (Principle I → templates composed at spin-up; Principle V
  wording → the deploy path lives in a deploy template; Principle VII → per-template runtime pin and
  gate; Technology Stack adds C#/.NET 8, ASP.NET Core minimal API, xUnit) with a Sync Impact Report in
  `.specify/memory/constitution.md`
- [ ] T002 Point the active-feature block at this spec in `CLAUDE.md` (between the SPECKIT markers)
- [ ] T003 Run `npm run check:all` on the spec branch; open the spec PR against `dev` with
  `## Decisions for Jeff`; merge once green (docs only)

---

## Phase 2: Foundational — the split (split PR; blocks every story)

**Purpose**: today's root becomes standalone templates and a hub that can compose them.

### Template: web-react

- [ ] T004 `git mv` today's front end into `templates/web-react/` (`src/web/*` → `src/`,
  `src/web/index.html` → `index.html`, `scripts/{dev,build,prerender,resolve-env,load-env,check-env-files}.mjs`,
  `scripts/lib/env-guard.*`), flattening `src/web` → `src`
- [ ] T005 Write `templates/web-react/package.json` (React, Vite, Vitest, ESLint, Prettier, TS,
  jsdom, tsx, dotenv) and derive `package-lock.json` from today's lockfile by pruning, keeping
  every remaining version unchanged
- [ ] T006 [P] Add `templates/web-react/{tsconfig.json,eslint.config.js,config/,.nvmrc,.gitignore,.env,environments.json}`
  (copies of today's, scoped to a browser project)
- [ ] T007 Add `scripts/lib/find-up-one.mjs` (own folder, then parent; manifest missing from both
  throws naming both) and use it in `templates/web-react/scripts/{load-env,resolve-env}.mjs`
- [ ] T008 Rewrite `templates/web-react/vite.config.ts`: root at the template, `SPINUP:api-only`
  block with the `/api` proxy to `API_URL`, required only for the dev server
- [ ] T009 Rewrite `templates/web-react/scripts/{dev,build}.mjs`: dev runs Vite only (with
  `npm run dev -- <args>` passed through, #8940f5); build runs Vite build and, in a
  `SPINUP:prerender-only` block, the prerender step; no server compile
- [ ] T010 Write the web resolver `templates/web-react/scripts/init.mjs` (`--render`, `--api=yes|no`,
  `--name`): markers, dynamic-only deletions, page title, package name, `.env` item name, test
  re-tiering, removal of its own scaffolding; marker blocks laid out so removal leaves
  prettier-clean source with no formatter run
- [ ] T011 [P] Move and adapt the web tests: `tests/app/example.test.tsx`, `tests/app/env-guard.test.ts`
  (shipped), `tests/machinery/{chip,env-accessor,prerender}.test.ts` (template-only) in
  `templates/web-react/tests/`
- [ ] T012 Write `templates/web-react/tests/machinery/init.test.ts`: resolve each of render ×
  api in a scratch copy, build, assert render strategy, proxy presence via the native config loader,
  removed scaffolding, prettier-clean output
- [ ] T013 [P] Write `templates/web-react/{template.json,README.md,README.app.md}`
- [ ] T014 Run the web-react gate green (`npm ci --prefix templates/web-react && npm --prefix templates/web-react run check:all`)

### Template: server-node

- [ ] T015 `git mv` today's server into `templates/server-node/` (`src/{server,config,env,env.generated,environments,version}.ts`,
  `src/routes/`, `scripts/{dev,build,resolve-env,load-env,check-env-files}.mjs`, `scripts/lib/env-guard.*`)
- [ ] T016 Write `templates/server-node/package.json` (Express; tsx, TS, Vitest, supertest, ESLint,
  Prettier, dotenv) and its pruned `package-lock.json`
- [ ] T017 [P] Add `templates/server-node/{tsconfig.json,tsconfig.build.json,vitest.config.ts,eslint.config.js,config/,.nvmrc,.gitignore,.env,environments.json}`
- [ ] T018 Change `templates/server-node/src/server.ts` to `createApp(webRoot)` serving `public/`
  (resolved from the working directory) with the SPA fallback; keep the `SPINUP:server-only` blocks
  for routes; build output `dist/server.js`
- [ ] T019 Rewrite `templates/server-node/scripts/{dev,build}.mjs` (dev: `tsx watch src/server.ts`;
  build: bake `src/env.generated.ts`, `tsc`), with find-up-one for `.env` and the manifest
- [ ] T020 Write the server resolver `templates/server-node/scripts/init.mjs` (`--api=yes|no`,
  `--name`): routes and markers, drop `dev` from its manifest when `--api=no`, test re-tiering, its
  own scaffolding
- [ ] T021 [P] Move and adapt server tests: `tests/app/{server-smoke,static-smoke,config,env-guard}.test.ts`
  (smoke tests now use a fixture web root), `tests/machinery/{environment,env-accessor}.test.ts`
- [ ] T022 Write `templates/server-node/tests/machinery/init.test.ts` (api yes/no: routes, dev
  manifest entry, prettier-clean output, build and serve)
- [ ] T023 [P] Write `templates/server-node/{template.json,README.md,README.app.md}`
- [ ] T024 Run the server-node gate green

### Template: deploy-cloud-run

- [ ] T025 `git mv cloudbuild.yaml` and `tests/machinery/cloudbuild.test.ts` into
  `templates/deploy-cloud-run/`; split today's `DEPLOY.md`: the per-app deploy job and Cloud Build
  half into `templates/deploy-cloud-run/DEPLOY.md`, stack-neutral where it describes the image
- [ ] T026 [P] Write `templates/deploy-cloud-run/{package.json,package-lock.json,vitest.config.ts,template.json,README.md}`
  and run its gate green

### Hub

- [ ] T027 Write `hub/registry.json` and `hub/lib/manifest.mjs` (read + validate manifests, `{dir}`
  substitution)
- [ ] T028 Write `hub/lib/stamp.mjs` (today's version finding, moved from `scripts/init.mjs`, run
  before anything moves)
- [ ] T029 Write `hub/files/scripts/{dev,copy-web,check-env-files}.mjs` and
  `hub/files/scripts/lib/env-guard.mjs`
- [ ] T030 [P] Write `hub/files/{gitignore,dockerignore,README.app.md}` and
  `hub/files/Dockerfile.node` (one build stage, runtime with server prod deps + `dist` + `public`,
  `USER node`)
- [ ] T031 Write `hub/init.mjs` and `hub/lib/compose.mjs`: validate everything first, stamp, move
  templates, run resolvers, write root `package.json`/lockfile/`.env`/manifest/Dockerfile/ignores/
  README/stamp, remove part copies and scaffolding, remove the hub and spec workflow and CI files,
  strip tags, print next steps
- [ ] T032 Rewrite the hub repo's root tooling: `package.json` (init, setup, check:hub,
  check:templates, check:all, spec:html; hub-only dev dependencies; pruned lockfile),
  `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`, `config/`, `.gitignore`,
  `config/.prettierignore` (ignore `templates/` and `hub/files/` formatting by their own gates where
  they have one)
- [ ] T033 [P] Write `hub/tests/copies.test.ts` (environments.json, env-guard.mjs, find-up-one.mjs,
  `.nvmrc` copies identical) and move `tests/machinery/actions-pinned.test.ts` to `hub/tests/`
- [ ] T034 Update `.github/workflows/ci-cd.yml` (`npm run setup` before the gate) and
  `.github/dependabot.yml` (npm for each Node template)

**Checkpoint**: every template gate green; the hub resolver composes.

---

## Phase 3: User Story 2 — existing combinations through the hub (Priority: P1)

**Goal**: `--api=node|none` × `--render=prerender|dynamic` behave as today.

**Independent test**: `hub/tests/compose.test.ts` for the four Node combinations.

- [ ] T035 [US2] Write `hub/tests/compose.test.ts` for the four Node combinations: compose in a
  scratch copy, symlink installs, root `build`, root `start`, the server contract, render strategy,
  stamp, root `.env`, root scripts, no scaffolding, no spec-workflow references, no dangling doc links
- [ ] T036 [US2] Run root `check:all` inside the test for one combination per API choice
- [ ] T037 [P] [US2] Write `hub/tests/stamp.test.ts` (today's stamp cases against the hub resolver)
- [ ] T038 [US2] Run `npm run check:all` at the hub root green; open the split PR (waits for Jeff)

---

## Phase 4: User Story 1 — React + C# (Priority: P1) 🎯 the request's done condition

**Goal**: `--api=dotnet` composes a React + C# app whose root check is green.

**Independent test**: quickstart §3.

- [ ] T039 [US1] Create `templates/server-dotnet/` (`Api.sln`, `global.json`,
  `Directory.Build.props` with the manifest lookup, `APP_ENV_NAME` bake and build-time check,
  `.editorconfig`, `.gitignore`, `.env`, `environments.json`)
- [ ] T040 [P] [US1] Write `templates/server-dotnet/src/Api/{Api.csproj,Program.cs,AppEnvironment.cs,Port.cs,VersionInfo.cs,Health.cs,Properties/launchSettings.json}`
  per the server contract
- [ ] T041 [P] [US1] Write `templates/server-dotnet/tests/Api.Tests/` (`Api.Tests.csproj`;
  health, version, noindex, port, environment identity, static files and fallback tests)
- [ ] T042 [US1] Write `templates/server-dotnet/{template.json,README.md,README.app.md}`; run its gate
  green (`dotnet format --verify-no-changes`, `dotnet build`, `dotnet test`)
- [ ] T043 [US1] Add `dotnet` to `hub/registry.json`; extend `hub/tests/compose.test.ts` with the two
  C# combinations (root `check:all` for one)
- [ ] T044 [US1] Add `actions/setup-dotnet` (SHA-pinned, v6.1.0) to `.github/workflows/ci-cd.yml` and
  a nuget entry to `.github/dependabot.yml`

---

## Phase 5: User Story 3 — one deployable image (Priority: P1)

**Goal**: the composed React + C# app builds into one image that meets the image contract.

**Independent test**: quickstart §5.

- [ ] T045 [US3] Write `hub/files/Dockerfile.dotnet` (Node stage for web, SDK stage publishing with
  `APP_ENV_NAME`, ASP.NET runtime with `wwwroot`, `USER app`, pinned tags)
- [ ] T046 [US3] Write `hub/image-e2e.mjs` and the root `e2e:image` script; run it (staging and
  production builds) and record the evidence in the C# PR
- [ ] T047 [US3] Write the remaining deploy step for Jeff into the C# PR body and
  `templates/deploy-cloud-run/DEPLOY.md`

---

## Phase 6: User Story 4 — each template stands alone (Priority: P2)

- [ ] T048 [P] [US4] Write `hub/tests/templates.test.ts`: manifests validate; no template file names
  `templates/`, `hub/`, or a sibling template; every manifest command uses `{dir}`
- [ ] T049 [US4] Copy each template alone into a scratch directory, run its `setup` and `check` with
  `{dir}` = `.`, and record the result in the PR (SC-003)

---

## Phase 7: User Story 5 — the handoff (Priority: P2)

- [ ] T050 [P] [US5] Write `hub/tests/refuse.test.ts`: missing or unknown `--api`, `--render`,
  `--name` → non-zero, names the problem and accepted values, no file changed
- [ ] T051 [US5] Rewrite `SPIN-UP.md`, `README.md`, `SUBDIR-LAYOUT.md` for the hub (choices and the
  agent-asks rule, the resolver command, setup, verify, commit, switching later)

---

## Phase 8: Polish

- [ ] T052 Run `/speckit-analyze` over spec, plan and tasks; fix what is unambiguous
- [ ] T053 Run the whole gate and the image check one last time; update quickstart if a command
  changed
- [ ] T054 File the multi-part CI recipe with the release flow (`ops request
  snackbyte-release-flow-action …`), and close #731762 with the research list

---

## Dependencies & execution order

- Phase 1 → spec PR merged.
- Phase 2 blocks everything else. Within it: T004–T014 (web-react), T015–T024 (server-node) and
  T025–T026 (deploy) are independent of each other; the hub (T027–T034) needs the three manifests.
- Phase 3 (US2) needs Phase 2. Phase 4 (US1) needs Phase 2 and the compose test from Phase 3.
- Phase 5 (US3) needs Phase 4. Phases 6–7 can run any time after Phase 2.

## Parallel opportunities

Within Phase 2, the three template blocks are independent folders. Within Phase 4, the C# API
(T040) and its tests (T041) are separate projects.

## Implementation strategy

1. Spec PR (Phase 1) — merged once green.
2. Split PR (Phases 2–3, plus 6–7 where they touch the same files) — the hub works for today's
   combinations; waits for Jeff.
3. C# PR (Phases 4–5) stacked on the split PR — the request's done condition and the deploy step;
   waits for Jeff.
4. Polish and follow-ups in their own PRs.
