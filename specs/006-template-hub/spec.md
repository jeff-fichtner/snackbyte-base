# Feature Specification: Template Hub

**Feature Branch**: `006-template-hub`

**Created**: 2026-11-16

**Status**: Draft

**Input**: Request #925778 (top priority) and Jeff's direction on it (2026-11-14/15): snackbyte-base
becomes the hub (the orchestrator, a working title) that composes an app from separate templates.
Now: split today's Vite + React + TypeScript front end and Node/Express back end out into their own
templates, and add a C# back end (an ASP.NET Core minimal API on the newest .NET, with xUnit). Done when a React + C#
app composed through the hub runs with both check gates green, and deploying it to Cloud Run is the
only step left.

## Context & Intent *(non-normative, read first)*

snackbyte-base is one template today: a Vite + React + TypeScript front end merged with an Express
server in a single Node package, resolved at spin-up by `init --mode=static|server
--render=prerender|dynamic`. Client work (Trimedx: React 18+ with .NET 6+/C#) needs React + C# apps
spun up from our template, and Snackbyte will build .NET beside TypeScript and deploy to AWS and Azure
beside Google Cloud (#731762). One merged Node package cannot hold a C# back end.

Request #925778 offered two shapes: (A) a back-end choice inside today's init, or (B) separate
templates (front end, back end, later mobile) with snackbyte-base composing a project from them. Jeff
chose **(B), a hub**. This spec records that choice and builds its first structure.

Seven design facts shape everything below. They follow from Jeff's direction and the week's rules;
the `## Decisions` section at the end lists each one with what was passed over.

1. **A template is a standalone project of one part.** Each template is a folder with its own
   dependencies, its own check gate, its own resolver for its own choices, its own README, and a small
   manifest that tells the hub how to set it up, run it, check it and build it. It never reaches into
   a sibling template. That is what lets it move into a repo of its own unchanged later: the hub would
   fetch it from that repo instead of copying a folder, and nothing inside the template changes.

2. **The hub composes; templates do not know about each other.** The hub (snackbyte-base's root)
   copies the chosen templates into an app's folders, runs each one's resolver, and writes the
   app-level files that only make sense for a combination: the root scripts that run every part, the
   one local `.env`, the one environments manifest, the container recipe that builds every part into
   one image, the README and the template stamp.

3. **A composed app has a `web/` part and a `server/` part.** The server is the one process that runs
   in production: it serves the web part's built files and, when the app has an API, the API under
   `/api`. Every combination uses the same two folder names, so the root scripts, the container
   recipe and the docs read the same whatever the stacks are.

4. **"No API" is today's static mode, unchanged.** An app with no API is composed with the Node server
   template resolved without its API, exactly as today's `static` mode serves the built files from an
   Express server with no `/api`. The person choosing says "API: none"; a small Node server still
   serves the files.

5. **The environments manifest and the local `.env` are app-level, once.** A composed app has one
   `environments.json` and one `.env`, at its root. Each template carries its own copies so it works
   standalone; a part looks for each file in its own folder first and its parent folder second, and the
   hub removes the parts' copies when it composes, so every part reads the app's one copy.

6. **Deploy is its own template, per target; the image is the hub's.** Where an app deploys varies
   independently of what it is built with, so each deploy target (Cloud Run now; Azure, AWS, a static
   host later) is a template of its own: the target's build-and-deploy config, its per-app deploy job,
   and a pointer to its setup runbook. The container recipe is not part of it: Cloud Run, Azure
   Container Apps and AWS App Runner all run the same image, and what that image holds depends on
   which parts were composed, so the recipe belongs to the hub's composition. This feature moves the
   existing Cloud Run files into their own deploy template and builds no new target.

7. **The C# server matches the Node server's contract.** It answers `/api/health` and `/api/version`
   with the same shapes, sends `X-Robots-Tag: noindex` for the same environments, listens on the port
   the platform gives it, serves the web build with the same single-page fallback, and bakes its
   environment identity at build from the same manifest. An app's front end and deploy job cannot
   tell which server it has.

The template stays one repository with one version line. Separate GitHub repos for the templates are
parked (creating repos is a GitHub action Jeff takes); the folders are built so that move is a copy.

## Clarifications

Jeff is not answering questions this week, so each question was answered with a best guess and is
also listed under `## Decisions`.

### Session 2026-11-16

- Q: Should the production images run as a non-root user? → A: Yes, both: the C# image uses the
  runtime image's built-in non-root user and the Node image the `node` user. The more secure option
  costs one line each and nothing in the app writes to its own files.
- Q: Is building the container image part of snackbyte-base's check gate? → A: No. The gate exercises
  the same production layout through the root `build` and `start` (FR-010); an opt-in hub command
  builds and runs a composed app's image under Docker, and its result is recorded as evidence in the
  build PR. A gate that needs a Docker daemon and pulls the .NET images would make every check slow
  and machine-dependent.
- Q: How does a composed app's CI install its parts? → A: `npm ci` at the root (the root manifest has
  no dependencies, so it installs nothing and keeps the release flow's default install step working),
  then the root `setup` script, then the root check. The release flow's CONSUMING.md owns CI wiring,
  so the multi-part recipe is filed there as a request rather than written here.
- Q: In an app with an API, what does an unknown `/api/...` path return? → A: The same as today's Node
  server: the single-page fallback (the web page). Both servers keep that behavior in this feature so
  the split changes nothing an app can observe; returning 404 for unknown API paths is a separate
  change for both servers together.
- Q: Does snackbyte-base's CI run the C# template's gate? → A: Yes. CI installs the template's .NET
  SDK through a SHA-pinned setup action and runs every template's gate, so a red C# template cannot merge.

### Session 2026-11-16 (second pass)

- Q: Are the C# projects and namespaces named after the app? → A: No. They are `Api` and
  `Api.Tests` in every app: descriptive, never seen by the app's users, and stable, so the resolver
  rewrites no C# source. The app's name appears where people read it (the page title, the README,
  the package manifest).
- Q: In an app with no API, does the root dev command start the Node server? → A: No, as today: the
  web dev server alone serves the pages in development, and the server only matters in production.
  The root dev command starts every part that declares a dev process for the composed choices.

## User Scenarios & Testing *(mandatory)*

The "user" throughout is a developer (or an agent) spinning up a new app from snackbyte-base, and the
maintainer of snackbyte-base keeping its templates healthy.

### User Story 1 — Compose a React + C# app and see both gates green (Priority: P1)

A developer copies snackbyte-base into a new app folder and runs the hub's resolver choosing a React
web part, a C# API and a render strategy. The hub produces an app with `web/` (React) and `server/`
(C# minimal API with an xUnit test project). After installing each part, the app's root check runs
the web part's gate and the C# part's gate and both pass. `npm run dev` brings up the web dev server
and the C# API together, and the page's `/api` calls reach the API.

**Why this priority**: This is the request's done condition and the client need that motivated it.
Every other story is either a prerequisite structure or parity for existing combinations.

**Independent Test**: In a scratch copy of the repo, run the resolver with the C# choice, install,
run the root check, start the root dev command and request `/api/health` through the web dev server;
build the production layout and request `/` and `/api/health` from the running C# server.

**Acceptance Scenarios**:

1. **Given** a fresh copy of snackbyte-base, **When** the hub resolver runs with the React web part,
   the C# API and a render strategy, **Then** the result has a `web/` part, a `server/` part holding
   a .NET solution with an API project and an xUnit test project, and none of the hub's or the unused
   templates' files.
2. **Given** that composed app with its parts installed, **When** the root check runs, **Then** the
   environment-file check, the web part's gate (format, lint, typecheck, env-file check, tests) and
   the C# part's gate (format verification, warning-free build, tests) all pass.
3. **Given** that composed app, **When** the root dev command runs, **Then** the web dev server and the
   C# API both start, and a request for `/api/health` made to the web dev server is answered by the
   C# API.
4. **Given** that composed app, **When** its production layout is built and the C# server started,
   **Then** `/` returns the web page (prerendered markup when the render strategy is prerender),
   `/api/health` and `/api/version` return JSON, and an unknown non-API path returns the web page.

---

### User Story 2 — Every existing combination still composes and behaves as today (Priority: P1)

A developer who wants what today's template produces — a React front end with an Express API, or a
React front end with no API — gets it from the hub, with the same behavior as today: the same pages,
the same `/api/health` and `/api/version`, the same noindex rule, the same version chip rule, the same
render strategies, the same template stamp, the same committed `.env` convention.

**Why this priority**: The split must not regress what apps spun up today get. A hub that can do C#
but broke the Node path would be a step back for every TypeScript app.

**Independent Test**: For each of {Node API, no API} × {prerender, dynamic}, compose in a scratch
copy, build the production layout, start the server and assert the pages, the API presence or
absence, the render strategy, the stamp, and that no template scaffolding is left.

**Acceptance Scenarios**:

1. **Given** a fresh copy, **When** the resolver runs with the Node API, **Then** the composed app
   serves the web page and answers `/api/health` with JSON.
2. **Given** a fresh copy, **When** the resolver runs with no API, **Then** the composed app serves the
   web page, and `/api/health` falls through to the web page (there is no API), as today's static
   mode does.
3. **Given** any combination, **When** it is composed, **Then** the app carries the template stamp
   (`.template.json`) in the format snackbyte-ops reads, and no hub scaffolding: no `templates/`, no
   hub resolver, no `SPIN-UP.md`, no spec workflow, no CI workflow, no unused template.
4. **Given** any combination built for a named environment, **When** the server runs, **Then**
   `/api/version` (where there is an API) reports that environment, `X-Robots-Tag: noindex` is sent
   exactly when that environment's manifest entry says so, and the version chip shows exactly when the
   entry is not the public face.

---

### User Story 3 — The composed app builds into one deployable image (Priority: P1)

The maintainer (Jeff) takes a composed React + C# app to Cloud Run. The app's root holds a container
recipe that builds both parts into one image, accepting the same build arguments the Cloud Run build
config already passes, and the Cloud Run deploy files from the deploy template. Running the existing
Cloud Run build config against the app is the only step left, and it is written down.

**Why this priority**: Deploying is the request's last step and is parked this week, so the work must
stop exactly one step short of it, with that step documented.

**Independent Test**: Build the composed app's image locally with the build arguments the Cloud Run
build config passes; run it with `PORT` set; request `/`, `/api/health` and `/api/version`; confirm
the version and environment reported match the build arguments and that the noindex header follows
the manifest.

**Acceptance Scenarios**:

1. **Given** a composed React + C# app, **When** its image is built with `APP_ENV_NAME=staging`,
   `APP_VERSION`, `BUILD_GIT_COMMIT` and `BUILD_DATE`, **Then** the build succeeds, and the running
   container listens on `PORT`, serves the web page with the version chip, answers `/api/version`
   with that version and `staging`, and sends `X-Robots-Tag: noindex`.
2. **Given** the same app built with `APP_ENV_NAME=production`, **When** it runs, **Then** the chip is
   absent, `/api/version` reports `production`, and no noindex header is sent.
3. **Given** the composed app, **When** a reader looks for how to deploy it, **Then** the deploy
   template's documentation names the one remaining step (running the Cloud Run build config with the
   app's service, region, environment and runtime identity), and the spec's handoff to Jeff states it
   as a paste-ready command.

---

### User Story 4 — Each template stands on its own (Priority: P2)

The maintainer works inside one template folder — the React web template, the Node server template,
the C# server template, the Cloud Run deploy template — and that folder installs, runs and passes its
own check gate without the hub or any sibling. A template folder copied out of snackbyte-base into an
empty directory still installs and passes its gate.

**Why this priority**: This is the property that makes the later move to separate repos a copy, and
it keeps each template's tests honest. It is P2 because the composed app (stories 1–3) is the
deliverable; standalone-ness is the shape that keeps it maintainable.

**Independent Test**: Copy each template folder alone into a scratch directory, install it, run its
gate.

**Acceptance Scenarios**:

1. **Given** a template folder copied alone into an empty directory, **When** its dependencies are
   installed and its check gate runs, **Then** the gate passes.
2. **Given** any template's files, **When** they are searched, **Then** none refers to a sibling
   template's folder or to the hub's files.
3. **Given** snackbyte-base's own check gate, **When** it runs, **Then** it runs every template's gate
   and the hub's composition tests, and fails if any one fails.

---

### User Story 5 — A spin-up agent can follow the handoff without guessing (Priority: P2)

A cold agent, given only the shipped docs, spins up an app through the hub. The handoff tells it which
choices are identity decisions it must ask the person about (the API stack, the render strategy, the
name), how to run the resolver, how to install every part, how to verify and how to commit.

**Why this priority**: Jeff validates this template by having a fresh agent spin it up from the docs
alone. The hub changes every step of that handoff, so the handoff must change with it.

**Independent Test**: Read the spin-up handoff in a fresh copy; every command it names exists and
runs as written; the resolver refuses to run without each required choice and names the missing one.

**Acceptance Scenarios**:

1. **Given** the resolver run without the API choice, the render choice or the name, **When** it runs,
   **Then** it exits non-zero, names what is missing, and changes nothing.
2. **Given** an unknown value for a choice, **When** the resolver runs, **Then** it exits non-zero
   listing the accepted values and changes nothing.
3. **Given** the handoff, **When** a reader follows it after composing a React + C# app, **Then** the
   install, verify and dev commands it names all work as written in that app.

---

### Edge Cases

- **A choice that has only one template** (the web part is React; the deploy target is Cloud Run): the
  resolver takes the only template for that role without a flag. When a second template arrives in a
  role, that role's flag becomes required. A role is never defaulted when it has a real choice.
- **A part started on its own from its folder** in a composed app (`cd web && npm run dev`): it reads
  the app's root `.env` and root manifest (own folder first, parent second), so it behaves the same as
  when started from the root.
- **The environments manifest is missing** from both a part's folder and its parent: the build stops
  with an error naming both paths it looked in.
- **`APP_ENV_NAME` names an environment not in the manifest**: the build of every part stops with an
  error naming the value and the environments that exist (today's rule, now also for the C# part).
- **The dev server starts in an app with an API but `API_URL` is not set**: the web dev server refuses
  to start, naming `API_URL` and the root `.env` that sets it. A production build and the tests do not
  need `API_URL`.
- **`PORT` is set to something that is not a port**: either server refuses to start, naming `PORT`
  (today's Node rule, now also for the C# server). Unset, both listen on 8080 (today's rule, for the
  same reason: the platform always sets it in production).
- **A composed app nested in a larger repository**: the template stamp is matched on the app's own
  directory, as today.
- **The resolver is run twice**: the first run deletes the resolver, so a second run is impossible (as
  today).
- **The resolver fails partway**: it validates every choice and every template it needs before it
  changes any file, so a refused run leaves the copy untouched.

## Requirements *(mandatory)*

### Functional Requirements

**Templates and the hub**

- **FR-001**: snackbyte-base MUST hold its templates as folders under one directory, one folder per
  template: a React web template, a Node server template, a C# server template, and a Cloud Run
  deploy template.
- **FR-002**: Each template MUST be a standalone project: its own dependency manifest and lockfile (or
  the .NET equivalent), its own check gate, its own README, its own environments manifest where it
  reads one, its own committed `.env` where it reads one (the Node templates; the C# server reads
  none), and its own resolver for any choice it has. A template copied alone into an empty directory
  (made a git repository, since the env-file check reads tracked files) MUST install and pass its own
  gate.
- **FR-003**: No template MAY refer to a sibling template's folder or to the hub's files. Files that
  are intentionally duplicated across templates (the environments manifest, the env-file guard, the
  Node version pin) MUST be kept identical by a check in snackbyte-base's gate.
- **FR-004**: Each template MUST carry a manifest the hub reads, stating its role (web, server or
  deploy), the folder it occupies in a composed app, and the commands to set it up, run it in
  development, check it, build it and start it. The commands are written from the root of whatever
  holds the template, with a placeholder for the template's folder, so the same manifest drives
  snackbyte-base's gate and a composed app's root scripts. The resolver command is the exception: it
  runs from inside the template's folder.
- **FR-005**: snackbyte-base's own check gate MUST run the hub's checks and tests and every template's
  own gate, and fail when any of them fails. A single command MUST install every template's
  dependencies. snackbyte-base's CI MUST install the C# template's .NET SDK, read from its `global.json`
  (through a SHA-pinned action, like every action it runs), and run that same gate.

**Composition**

- **FR-006**: The hub resolver MUST take the API choice (`node`, `dotnet` or `none`), the render
  strategy (`prerender` or `dynamic`) and the app name, all required, with no default. It MUST refuse
  to run, naming what is missing or invalid and changing no file, when any is absent or unknown.
- **FR-007**: A role with exactly one template (today: web and deploy) MUST be filled without a flag. A
  role with more than one template MUST require a flag.
- **FR-008**: The hub resolver MUST produce an app whose web part is in `web/` and whose server part is
  in `server/`. `--api=node` composes the Node server with its API, `--api=dotnet` the C# server,
  `--api=none` the Node server without its API.
- **FR-009**: The hub resolver MUST run each composed template's own resolver with the choices that
  template owns (the web template: render strategy and whether the app has an API; the Node server:
  whether it has an API; every template with a resolver: the app name), and delete every unused
  template. Each
  template's resolver removes that template's own scaffolding (its resolver, its template-only tests,
  its template-facing README and manifest) and leaves the part an app owns.
- **FR-009a**: A composed app's README MUST give its CI install order: a root `npm ci`, then the root
  `setup`, then the root check. The release flow's CONSUMING.md owns CI wiring; the multi-part recipe
  is filed there as a request.
- **FR-010**: The composed app's root MUST hold: a package manifest with no dependencies (and its
  lockfile, so a root `npm ci` succeeds and installs nothing) carrying the app's `MAJOR.MINOR`
  version line (starting at `0.1`) and root scripts that set up, develop, build, start and check every
  part; the one `.env`; the one `environments.json`; the container recipe for its server stack and its
  ignore file; the deploy template's files; the app's README; the git ignore file; the Node version
  pin; and the template stamp.
- **FR-011**: The composed app's root check MUST run the environment-file check over every tracked env
  file and then each part's own gate, and fail when any fails.
- **FR-012**: The composed app's root dev command MUST load the root `.env` (refusing to start with an
  unresolved 1Password reference, as today), and start every part's dev process together, stopping all
  of them when any stops. A server without an API declares no dev process, so an app with no API runs
  only the web dev server in development, as today.
- **FR-013**: The composed app's root `.env` MUST carry the config keys every composed part needs (the
  server's `PORT`; the web dev server's `API_URL` when the app has an API) declared on its `# config:`
  line, and name the app's 1Password item `<name>.local`, as today.
- **FR-013a**: Each part MUST look for `environments.json`, and each Node part for `.env`, in its own
  folder first and its parent folder second, so it reads its own copies when standalone and the app's
  root copies when composed. The manifest missing from both MUST stop the build with an error naming
  both paths; a missing `.env` is not an error (required values fail where they are required). The C#
  part reads no `.env`: the root dev command passes it the environment, and run alone it is started
  under `op run --env-file=<file>` when it needs a secret.
- **FR-014**: The hub resolver MUST remove all hub scaffolding from the app: the templates directory,
  the hub resolver and its tests, `SPIN-UP.md`, `SUBDIR-LAYOUT.md`, the spec workflow (`.specify/`,
  `specs/`, the `speckit-*` skills, `CLAUDE.md`), the CI workflow and its Dependabot config, the hub's
  own tooling configuration, and the template's inherited git tags.
- **FR-015**: The hub resolver MUST write `.template.json` as today: `template` is `snackbyte-base`,
  `version` is found (never guessed) from the release whose tree matches the app's first commit, else
  `null` with a stated reason. The stamp's format MUST NOT change.

**Parts**

- **FR-016**: The React web template MUST keep today's front end: the page, the version chip and its
  public-face rule, the build-time environment identity from `APP_ENV_NAME` resolved against the
  manifest, prerender and dynamic render strategies resolved at spin-up, and a dev proxy that sends
  `/api` to `API_URL` when the app has an API.
- **FR-017**: The Node server template MUST keep today's server: `/api/health` and `/api/version` when
  it has an API, no `/api` when it does not, the noindex rule from the baked identity, `PORT` handling
  with today's fail-loud rule, and serving the web build with a single-page fallback.
- **FR-018**: The C# server template MUST be an ASP.NET Core minimal API on the newest .NET release
  (.NET 11 today), with the release set in one place, `global.json`'s SDK version, with an xUnit test
  project, matching the Node server's contract: `/api/health` and `/api/version` with the same JSON
  shapes; `X-Robots-Tag: noindex` exactly when the baked environment's manifest entry says so; the
  environment identity baked at build from `APP_ENV_NAME` and the same manifest, refusing at build an
  environment the manifest does not list; listening on `PORT` with the Node server's rule; serving the
  web build from its web root with a single-page fallback that, like the Node server's, also answers
  unknown `/api/...` paths; and a typed accessor server code reads to ask which environment it is in
  (its name, whether it is the public face, an `is(name)` check), like the Node server's.
- **FR-019**: The C# server template's check gate MUST verify formatting, build with warnings treated
  as errors, and run the xUnit tests.
- **FR-019a**: The C# projects MUST be named `Api` and `Api.Tests` in every app; the resolver rewrites
  no C# source to carry the app's name.
- **FR-020**: The Cloud Run deploy template MUST hold today's Cloud Run build config, its tests, and
  the per-app deploy documentation, unchanged in behavior. It MUST NOT depend on which server stack
  the app has: it builds the image from the app's root container recipe with the same build
  arguments it passes today.

**The image**

- **FR-021**: The container recipe for each server stack MUST build every part into one image that
  accepts `APP_ENV_NAME`, `APP_VERSION`, `BUILD_GIT_COMMIT` and `BUILD_DATE` as build arguments,
  listens on `PORT`, serves the web build and (with an API) the API, carries no source, no env file
  and no build toolchain in its runtime stage, and runs as a non-root user.
- **FR-021a**: Building the image MUST NOT be part of snackbyte-base's check gate. An opt-in hub
  command MUST, for each API choice (`node`, `dotnet`, `none`), compose an app, build its image with
  the Cloud Run build arguments, run it and check `/`, the API (or its absence), `/api/version` and the
  noindex header, so every image recipe can be verified on any machine with Docker.

**Docs and governance**

- **FR-022**: The spin-up handoff, the template README and the per-template READMEs MUST describe the
  hub: the choices (and that an agent asks the person for each), the resolver command, installing
  every part, verifying, committing, and how to switch a choice later.
- **FR-023**: Shipped files MUST NOT reference the spec workflow (the existing rule), and no template
  MAY ship a reference to a file the composed app does not have.
- **FR-024**: The constitution MUST be amended to describe the hub: templates composed at spin-up in
  place of one mode-neutral template, and a technology stack that includes C#/.NET for the C# server.
- **FR-025**: The deploy question MUST be answered in this spec with reasoning (Context fact 6 and
  research), and the single remaining deploy step for a composed React + C# app MUST be written down
  for Jeff.

### Key Entities

- **Template**: a standalone project of one part. Has a role (web, server, deploy), a folder name in a
  composed app, its own gate, its own resolver for its own choices, and a manifest the hub reads.
- **Template manifest**: the small file in each template that names its role, its folder, and its
  setup, dev, check, build and start commands.
- **Hub resolver**: the one-time command at snackbyte-base's root that composes an app from templates
  in place, then removes itself and everything that is not the app.
- **Composed app**: the result: `web/`, `server/`, and root files that belong to the combination.
- **Environments manifest**: today's `environments.json`, unchanged in shape; one per composed app,
  read by every part.
- **Template stamp**: today's `.template.json`, unchanged in format.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A React + C# app composed through the hub passes its root check (both parts' gates and
  the env-file check) on the first run after installing, with zero manual edits, and its root dev
  command serves the C# API's `/api/health` through the web dev server (an automated test).
- **SC-002**: All six combinations (three API choices × two render strategies) compose, build, start
  and pass their behavioral checks in snackbyte-base's own test suite.
- **SC-003**: Each of the four templates, copied alone into an empty directory, installs and passes
  its own gate.
- **SC-004**: Each API choice's composed image builds locally with the Cloud Run build arguments and
  serves the page and (with an API) `/api/health` and `/api/version` with the right environment and
  noindex behavior, for both a staging and a production build.
- **SC-005**: After this feature, deploying a composed React + C# app to Cloud Run takes one documented
  command and no change to any file in the app or the deploy template.
- **SC-006**: snackbyte-base's own check gate is green locally and in CI.

## Assumptions

- **The newest .NET.** The request named .NET 8, from the reference project. Jeff's ruling
  (2026-11-18, #029272 as amended by #49d26b): the template targets the newest .NET release, .NET 11
  today, and moves to each new release when it ships. An app that needs an older release for a client
  changes `global.json`'s SDK version (and its image recipe's matching release).
- **xUnit v2 with the ASP.NET Core test host**, the same test approach as the reference slice.
- **The web part is always present.** An API-only app (no web part) is out of scope this week; each
  server template already runs alone as a standalone project, and the hub can add `--web=none` later.
- **The image is built only in the container**; locally, the root build assembles the same production
  layout so the composition tests exercise it without Docker.
- **Template names, flag names and flag values** are working names in one place (the hub's registry of
  templates and each template's manifest). The names a consuming developer types are parked for Jeff.
- **Snackbyte-base's version is not bumped by this work**; a version change is Jeff's call.
- **No template is published** (no npm or NuGet package), no repo is created, nothing is deployed.

## Out of Scope

- Separate GitHub repos for the templates (parked: creating repos).
- A mobile template, a plain (non-React) web template, an API-only composition.
- Any new deploy target, including Azure (#65c2c1, which follows this work).
- Deploying the composed app (parked this week; the step is written down).
- Renaming snackbyte-base or changing the template stamp format.

## Decisions

Best-guess decisions made as Jeff's stand-in (the week's rules), for his tour. Each says what was
chosen, what was passed over, and what switching would take. The PR carries the same list under
`## Decisions for Jeff`.

1. **One template or a hub (request #925778's A vs B).** Chosen: **B, a hub** — Jeff's direction of
   2026-11-14/15, recorded here as the request asks. Passed over: A, a `--backend` choice inside
   today's init. Switching: not sensible once templates are split; A would mean folding the C# server
   back into a single resolver.
2. **Where the templates live.** Chosen: folders under `templates/` in snackbyte-base, each a
   standalone project. Passed over: a GitHub repo per template now (parked: creating repos is Jeff's).
   Switching: copy each folder into its repo; the hub then fetches a template instead of copying a
   folder. Nothing inside a template changes.
3. **Should deploy be its own template?** Chosen: yes, one deploy template per target (Cloud Run now),
   holding the target's build-and-deploy config, its deploy job docs and a pointer to its runbook; the
   container recipe stays with the hub's composition, because every target runs the same image and the
   image depends on which parts were composed. Passed over: (a) deploy files inside each server
   template, which would repeat every target once per server stack; (b) the image recipe inside the
   deploy template, which would repeat every server stack once per target. Switching: moving files
   between folders; no behavior changes.
4. **The composed app's folders.** Chosen: `web/` and `server/` in every combination. Passed over:
   `api/` (the reference slice's name), which is wrong for an app with no API; and keeping a React +
   Node app merged in one package at the root, which a C# server cannot share. Switching: a rename in
   the hub's composition (folder names, root scripts, container recipes).
5. **What serves an app with no API.** Chosen: the Node server template without its API, which is
   exactly today's `static` mode. Passed over: a static-file image (nginx) or a static host, which
   would need the noindex rule rebuilt elsewhere and is a new deploy shape. Switching: a static-host
   deploy template later can serve `--api=none` apps without a server.
6. **Where `.env` and `environments.json` live in a composed app.** Chosen: once, at the root; each
   part looks in its own folder, then its parent. Passed over: a copy per part (they drift); having the
   hub rewrite a path inside each part (edits template source at compose). Switching: small; the
   lookup is one function per stack.
7. **Flags for roles with one template.** Chosen: no `--web` or `--deploy` flag while each role has
   only one template; a role's flag becomes required when a second template joins it. Passed over:
   requiring `--web=react --deploy=cloud-run` now (a choice with one answer is ceremony an agent would
   still have to ask about). Switching: add the flag when the second template lands.
8. **Names a consuming developer types — parked.** Working names, kept in one registry so a rename is
   one place plus folder moves: the flags `--api=node|dotnet|none` and `--render=prerender|dynamic`;
   the template folders `web-react`, `server-node`, `server-dotnet`, `deploy-cloud-run`; proposed repo
   names if they move out: `snackbyte-web-react`, `snackbyte-server-node`, `snackbyte-server-dotnet`,
   `snackbyte-deploy-cloud-run`. Blocks: nothing this week; it blocks creating the repos.
9. **.NET 8 or .NET 10.** Ruled 2026-11-18 (#029272, amended by #49d26b): neither; the newest
   release, .NET 11 today, with the release as one setting. The original entry follows. Chosen: .NET
   8, as the request and the brief name. Passed over: .NET 10,
   the current long-term release. Why it matters: .NET 8's support ended on 2026-11-10, so it gets no
   more security fixes; the client asked for ".NET 6+", which .NET 10 satisfies. Recommendation:
   switch to .NET 10 before the first real app. Switching: change the target framework in one file,
   the SDK pin and the two image tags, update the test packages, and install the .NET 10 SDK on each
   machine (only .NET 8 is installed here).
10. **Snackbyte-base's version — parked.** Ruled 2026-11-18 (#029272): 2.0 when the hub lands. Not
    bumped (agents do not touch the version). Suggest
    `2.0` when this lands: every spin-up command and the app's layout change.
11. **The constitution.** Chosen: amend it to 3.0.0 in this spec (Principle I becomes a hub of
    templates; the stack gains C#/.NET for the C# server; the quality-gate principle applies per
    template). Passed over: leaving it describing one template, which every plan check would then
    fail. Switching: a doc edit.
12. **The template stamp.** Chosen: unchanged (`template` + `version`). Passed over: adding the
    composed parts to it, which changes a format snackbyte-ops owns. Switching: add a field and file
    an ops request to document it; the app's folders already show its parts.
13. **API-only apps.** Chosen: out of scope; the web part is always composed. Passed over:
    `--web=none` now. Switching: small; both server templates already run alone.
14. **A local production run besides the image.** Chosen: the composed app's root `build` and `start`
    assemble and run the same production layout the image does, so the composition tests exercise it
    without Docker. Passed over: image-only. Switching: drop two root scripts.
15. **Non-root images.** Chosen: both images run as a non-root user. Passed over: root, as today's
    Node image runs. Switching: one line per recipe. (Listed because it changes today's Node image.)
16. **The image build is not in the gate.** Chosen: an opt-in hub command builds and checks the image;
    the gate uses the root `build`/`start` path. Passed over: building the image in every check (needs
    Docker, pulls about a gigabyte of .NET images). Switching: add the command to the gate and to CI.
17. **A composed app's CI install.** Chosen: root `npm ci` (installs nothing), root `setup`, root
    check; the recipe is filed with the release flow, which owns CI wiring. Passed over: npm
    workspaces (would hoist the Node parts' tools away from where the templates' scripts expect them).
    Switching: rework the Node templates' scripts to run from a hoisted install.
18. **Unknown `/api/...` paths.** Chosen: the web page, as today's Node server does, in both servers.
    Passed over: a 404 for unknown API paths (better for API clients, but a behavior change the split
    should not smuggle in). Switching: one route per server, plus their tests. Ruled 2026-11-18
    (#029272, ruling 2): unknown API paths answer 404 in both servers, as a follow-up after the
    split. An app with no API keeps serving the page on every path.
19. **snackbyte-base's CI runs the C# gate.** Chosen: yes, with the template's .NET SDK (read from
    its `global.json`) installed by a SHA-pinned action. Passed over: running only the TypeScript gates in CI. Switching: one workflow
    step.
20. **C# project names.** Chosen: `Api` and `Api.Tests` in every app. Passed over: `<AppName>.Api`
    (the .NET habit), which means rewriting folders, project files and namespaces at spin-up.
    Switching: a resolver step that renames them, or a manual rename in one app.
21. **Dev in an app with no API.** Chosen: only the web dev server runs, as today. Passed over:
    starting the Node static server too (it would serve nothing useful in development). Switching: give
    the static server a dev command.
22. **The C# template carries no `.env`.** Chosen: none (it reads none; `PORT` defaults locally and
    the composed app's root `.env` holds the app's values). Passed over: a committed `.env` like the
    Node templates', which nothing in a standalone C# repo would check. Switching: add one plus an
    env-file check to its gate.
23. **The spec PR merged without Jeff's review.** It carries the constitution's MAJOR amendment
    (3.0.0). The week's brief lets specs, plans and the record merge once green; the amendment is a
    doc and reverts cleanly. Revisit: if the hub's direction changes on review, the constitution
    changes with it.
