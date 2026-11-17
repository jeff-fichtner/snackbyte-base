# Implementation Plan: Template Hub

**Branch**: `006-template-hub` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-template-hub/spec.md`

## Summary

Restructure snackbyte-base from one merged template into a hub that composes an app from standalone
templates. Today's root moves into four folders under `templates/` — `web-react` (Vite + React + TS),
`server-node` (Express + TS), `server-dotnet` (new: .NET 8 minimal API + xUnit) and
`deploy-cloud-run` (today's `cloudbuild.yaml` and the deploy half of `DEPLOY.md`) — each with its
own manifest (`template.json`), dependencies, gate and README. The root becomes the hub: `hub/init.mjs`
reads `hub/registry.json` and the chosen templates' manifests, moves the chosen templates into
`web/` and `server/`, runs each one's resolver, writes the app-level files from `hub/files/` (root
package manifest and scripts, `.env`, `environments.json`, the container recipe for the server stack,
ignore files, README, template stamp) and deletes everything else, itself included. Composition is
exercised end to end for all six combinations by the hub's tests; the image path by an opt-in
Docker check.

## Technical Context

**Language/Version**: TypeScript 6 on Node 24 (web-react, server-node, hub scripts, deploy-cloud-run's
tests); C# 12 on .NET 8 (server-dotnet). Node stays on 24 here; the move to Node 26 (#575d6a) is a
separate change after this one.

**Primary Dependencies**: web-react: React 19, Vite 8, `@vitejs/plugin-react`, dotenv(+expand).
server-node: Express 5, tsx, dotenv(+expand). server-dotnet: ASP.NET Core 8 (minimal API), no
third-party runtime packages. Hub: Node built-ins only at spin-up; vitest, prettier, eslint,
typescript and `@snackbyte/spec-render` as the hub repo's own dev tooling.

**Storage**: N/A.

**Testing**: Vitest (web-react, server-node, deploy-cloud-run, hub). xUnit 2.9 +
`Microsoft.AspNetCore.Mvc.Testing` (server-dotnet). Hub composition tests run real resolves, builds
and servers in scratch directories; an opt-in `npm run e2e:image` builds and runs a composed image
under Docker.

**Target Platform**: Developer machines (macOS, Linux; Windows tolerated by using Node for every
script), GitHub Actions `ubuntu-latest` for snackbyte-base's CI, Cloud Run (linux/amd64 container)
for composed apps.

**Project Type**: Template repository: a hub plus four standalone template projects.

**Performance Goals**: Spin-up to a running dev server stays within the constitution's five-minute
bar (resolve is seconds; installs dominate). snackbyte-base's gate: no target, but composition tests
share one composed app per combination and symlink installed `node_modules` rather than copying.

**Constraints**: Fail-loud configuration (Jeff's rule; no silent defaults except today's justified
`PORT` default). Shipped files never reference the spec workflow (constitution VIII). Templates never
reference siblings or the hub (FR-003). The template stamp format is unchanged (FR-015). No publish,
no repo creation, no deploy.

**Scale/Scope**: 4 templates, 6 compositions, ~60 files moved, ~25 new files (most of them C#).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against constitution 2.1.0, then against the amendment this feature makes (3.0.0, FR-024).

| Principle | 2.1.0 says | This plan | Status |
|-----------|------------|-----------|--------|
| I. Single Template, Mode Resolved at Spin-Up | exactly one mode-neutral skeleton | a hub of templates, composed at spin-up | **Violates 2.1.0 → amended** (3.0.0 redefines I as "Templates Composed at Spin-Up"; the resolve-once, no-runtime-switch rule is kept) |
| II. Convention Over Configuration | no re-deciding tooling; running in < 5 min | each template ships its tooling; three identity choices at spin-up | Pass |
| III. Skeleton Only | no app logic | `/api/health`, `/api/version`, the sample page only, in every server | Pass |
| IV. Two-Tier Propagation | skeleton by backport, visual identity by package | unchanged | Pass |
| V. Uniform Deploy Path (Cloud Run Default) | one container path for every app | one image per app, any server stack; Cloud Run deploy template | Pass (wording amended: the deploy path lives in a deploy template) |
| VI. Prerender By Default | prerender default, dynamic available | unchanged, owned by web-react | Pass |
| VII. Pinned, Linted, Type-Safe, Tested | Node 24, TypeScript throughout, ESLint/Prettier/Vitest | each template pins its runtime and ships its gate; C# template: .NET 8 SDK pin, `dotnet format`, warnings as errors, xUnit | **Violates 2.1.0 ("TypeScript throughout") → amended** |
| VIII. Speckit Stays in Speckit Spaces | no spec references in shipped files | unchanged; hub test keeps scanning | Pass |
| Technology Stack | TS, Vite, React, Express, Vitest, Node 24, GCP | adds C#/.NET 8, ASP.NET Core minimal API, xUnit for the C# server | **Amended** |

Gate result: pass with the 3.0.0 amendment, which is part of this feature's spec PR (Complexity
Tracking records why).

**Post-design re-check (after Phase 1)**: still passes. The design adds no runtime switch (every
choice is resolved into source at spin-up), no app logic, and no second deploy path. The one new
cross-template mechanism (own-folder-then-parent lookup) is a fixed two-candidate rule, not
configuration.

## Project Structure

### Documentation (this feature)

```text
specs/006-template-hub/
├── spec.md
├── plan.md              # this file
├── research.md          # decisions R1–R14 + the GCP/TypeScript assumption list (#731762)
├── data-model.md        # template manifest, registry, composed app, stamp
├── quickstart.md        # validation scenarios
├── contracts/
│   ├── hub-cli.md               # the hub resolver's command, flags, exit behavior
│   ├── template-manifest.md     # template.json fields and the {dir} rule
│   ├── server-contract.md       # what every server template answers and reads
│   └── image-contract.md        # build args, PORT, layout, user
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
hub/                              # the hub; deleted from every composed app
├── init.mjs                      # the resolver (npm run init); validates, composes, self-deletes
├── lib/                          # compose, manifest, env, stamp, scaffolding modules
├── registry.json                 # roles → flag values → templates (the one place for user-typed names)
├── files/                        # app-level files placed at a composed app's root
│   ├── Dockerfile.node
│   ├── Dockerfile.dotnet
│   ├── dockerignore              # placed as .dockerignore (no leading dot here, so it never applies to the hub)
│   ├── gitignore                 # placed as .gitignore
│   ├── README.app.md
│   └── scripts/
│       ├── dev.mjs               # loads root .env, runs every dev:* script together
│       ├── copy-web.mjs          # places the web build into the server's web root
│       ├── check-env-files.mjs   # the env-file gate over every tracked env file
│       └── lib/env-guard.mjs     # identical copy (hub test)
├── image-e2e.mjs                 # opt-in: compose → docker build → run → check (npm run e2e:image)
└── tests/                        # hub tests (vitest)
    ├── compose.test.ts           # six combinations, end to end
    ├── refuse.test.ts            # missing/invalid choices change nothing
    ├── stamp.test.ts             # template stamp version finding
    ├── copies.test.ts            # intentionally duplicated files are identical
    ├── templates.test.ts         # manifests valid; no template references a sibling or the hub
    └── actions-pinned.test.ts    # every action SHA-pinned (CI + the deploy job docs)

templates/
├── web-react/                    # standalone Vite + React + TS project
│   ├── template.json  README.md  README.app.md  package.json  package-lock.json
│   ├── index.html  vite.config.ts  tsconfig.json  eslint.config.js  config/
│   ├── .env  .nvmrc  .gitignore  environments.json
│   ├── src/        App.tsx main.tsx VersionChip.tsx env.ts version.ts prerender.ts
│   ├── scripts/    init.mjs dev.mjs build.mjs prerender.mjs resolve-env.mjs load-env.mjs
│   │               check-env-files.mjs lib/env-guard.mjs lib/find-up-one.mjs
│   └── tests/      app/ (shipped)  machinery/ (template-only)
├── server-node/                  # standalone Express + TS project
│   ├── template.json  README.md  README.app.md  package.json  package-lock.json
│   ├── tsconfig.json  tsconfig.build.json  vitest.config.ts  eslint.config.js  config/
│   ├── .env  .nvmrc  .gitignore  environments.json
│   ├── src/        server.ts config.ts env.ts env.generated.ts environments.ts version.ts routes/
│   ├── scripts/    init.mjs dev.mjs build.mjs resolve-env.mjs load-env.mjs
│   │               check-env-files.mjs lib/env-guard.mjs lib/find-up-one.mjs
│   └── tests/      app/  machinery/
├── server-dotnet/                # standalone .NET 8 solution
│   ├── template.json  README.md  README.app.md  Api.sln  global.json  Directory.Build.props
│   ├── .editorconfig  .env  .gitignore  environments.json
│   ├── src/Api/    Api.csproj Program.cs AppEnvironment.cs Port.cs VersionInfo.cs Health.cs
│   │               Properties/launchSettings.json
│   └── tests/Api.Tests/  Api.Tests.csproj  *Tests.cs
└── deploy-cloud-run/             # today's Cloud Run deploy, unchanged in behavior
    ├── template.json  README.md  package.json  package-lock.json  vitest.config.ts
    ├── cloudbuild.yaml  DEPLOY.md
    └── tests/cloudbuild.test.ts

package.json  package-lock.json   # the hub repo's own tooling (+ init, setup, check:all, e2e:image)
environments.json                 # the hub's own release flow; also the composed app's copy
.github/  .specify/  .claude/  specs/  CLAUDE.md  SPIN-UP.md  SUBDIR-LAYOUT.md  README.md
config/  eslint.config.js  tsconfig.json  vitest.config.ts  .nvmrc  .gitignore
```

A composed app (React + C#):

```text
<app>/
├── web/            # templates/web-react, resolved
├── server/         # templates/server-dotnet (Api.sln, src/Api, tests/Api.Tests)
├── scripts/        # dev.mjs, copy-web.mjs, check-env-files.mjs, lib/env-guard.mjs
├── package.json  package-lock.json   # version 0.1, no dependencies, root scripts
├── .env  environments.json  .nvmrc  .gitignore  .dockerignore
├── Dockerfile      # hub/files/Dockerfile.dotnet
├── cloudbuild.yaml  DEPLOY.md        # from deploy-cloud-run
├── README.md       # hub/files/README.app.md, filled in
└── .template.json
```

**Structure Decision**: the hub-and-templates layout above. The hub is everything at the root that is
not under `templates/`; every template folder is self-contained. Today's root source moves into
`templates/web-react` and `templates/server-node` with history preserved (`git mv`).

## Phases and PRs

Each phase is its own branch and PR, stacked where it depends on the previous one.

1. **Spec PR** (`006-template-hub`, base `dev`): spec, plan, research, data model, contracts,
   quickstart, tasks, the constitution amendment, `CLAUDE.md`'s active-feature pointer. No functional
   code: merges once green.
2. **Split PR** (base: dev after the spec PR): `templates/web-react`, `templates/server-node`,
   `templates/deploy-cloud-run`, the hub resolver for `--api=node|none`, hub tests, CI updates, docs.
   Functional code: waits for Jeff's review.
3. **C# PR** (stacked on the split PR): `templates/server-dotnet`, `--api=dotnet`,
   `Dockerfile.dotnet`, the opt-in image check, CI's .NET SDK step. Waits for Jeff's review. Carries
   the written deploy step.
4. **Follow-ups** (separate PRs): inbox asks that do not fight the restructure.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle I (one template) | A C# server cannot share one Node package with the React front end; Jeff chose a hub (B) | A `--backend` flag in today's init (A) keeps one package per app, which a .NET solution cannot join |
| Principle VII (TypeScript throughout) | The C# server is C# by definition | Keeping TypeScript-only would refuse the request |
| Duplicated files across templates (manifest, env guard, Node pin) | Each template must stand alone to move into its own repo unchanged | A shared package would need publishing (parked); a hub-relative import would break standalone use. A hub test keeps the copies identical |
