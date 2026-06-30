# Contract: Environment Identity (build → bake → runtime)

How the active environment flows from the manifest, through the build, into the immutable image, and
out to every consumer (chip, noindex, `/api/version`, the typed `env` accessor). Verified by Vitest
(noindex, chip, accessor, `local` fallback) and the byte-identical default-path check.

---

## The flow

```text
environments.json ──(name lookup at build)──▶ facets ──(bake)──▶ image ──(read)──▶ consumers
                                                                                    ├── chip (isPublicFace)
   CI/deploy passes APP_ENV_NAME ─────────────┘                                     ├── noindex (noindex facet)
   (the env NAME only — one build-arg)                                              ├── /api/version (name)
                                                                                    └── env accessor (server + frontend)
```

1. **CI/deploy → build**: pass a single `APP_ENV_NAME` build-arg = the environment **name**
   (e.g. `production`, `staging`, `qa`). That is the *only* env build-arg; facets are NOT passed
   separately.
2. **Build resolves facets**: at build time, `APP_ENV_NAME` is looked up in `environments.json` to get
   `isPublicFace`, `noindex`, and the `name`. (Done once; threaded into Vite `define` and the prerender
   globals, mirrored exactly.)
3. **Bake**: the identity is inlined into the **frontend bundle** (define tokens) and into the
   **compiled server**. It is now immutable for the image's life.
4. **Runtime read**: every consumer reads the baked value. The runtime `APP_ENV` is at most a
   pass-through of the same name — never an independently-settable source of truth.

### Two bake mechanisms (the build/runtime seam)

The identity is "baked" by two different mechanisms because the frontend and the server are compiled
differently — but both resolve from the **same** `APP_ENV_NAME` lookup, so they cannot disagree:

- **Frontend** — Vite `define` inlines `__APP_ENV_NAME__` (and `__IS_PUBLIC_FACE__`) as literals into
  the bundle. Already how the chip works. No runtime read.
- **Server (plain Node, no Vite `define`)** — the build resolves `APP_ENV_NAME` against
  `environments.json` and **writes a generated module** `src/env.generated.ts` (e.g.
  `export const BAKED = { name: 'staging', isPublicFace: false, noindex: true } as const;`) as a build
  step, before `tsc` compiles the server. The compiled server imports `BAKED` — a true build-time
  constant in the artifact, not a `process.env` read. `src/env.ts` and `src/version.ts` read `BAKED`.
  The file is **committed with a default `local` identity** (not gitignored) so the static
  `import { BAKED }` always resolves and `tsc`/`check:all` pass locally without a missing module; the
  build **overwrites** it with the real baked identity. It is listed in `.prettierignore` (its content
  varies per build target, so it is not format-gated). With no build (local `npm run dev`), the
  committed `local` default stands in, mirroring how the frontend define falls back to `local`.

  *Boundary note*: only the **environment identity** (name + facets) is build-time-baked on the server.
  The version *number*, commit, and date remain runtime env vars (`APP_VERSION`/`BUILD_GIT_COMMIT`/
  `BUILD_DATE`), exactly as today — this feature does not move those to build-time.

This keeps the invariant "frontend and server report the same environment for the same image": both
are produced from one `APP_ENV_NAME` resolution at build time.

---

## Build-arg / token surface

| Build-arg (in) | Baked token / value (out) | Consumer |
|---|---|---|
| `APP_ENV_NAME` | frontend define `__APP_ENV_NAME__`; server `src/env.generated.ts` `BAKED.name` | `env.name`, `/api/version` `environment` |
| (resolved) `isPublicFace` | `APP_IS_PUBLIC_FACE` build-arg → `__IS_PUBLIC_FACE__` | version chip (already build-keyed) |
| (resolved) `noindex` | baked `noindex` boolean (frontend + server) | server `X-Robots-Tag` middleware |
| `APP_VERSION` | `__APP_VERSION__` / server `version.number` | version report (unchanged) |
| `BUILD_GIT_COMMIT`, `BUILD_DATE` | unchanged | version report (unchanged) |

`vite.config.ts` and `scripts/prerender.mjs` MUST read these **identically** (the existing mirror rule)
so prerender and hydration agree.

---

## Runtime behavior contract

| Consumer | Rule |
|---|---|
| **Version chip** | Shown iff `!isPublicFace` (build-keyed, from baked identity). Production (public face) hides it. Byte-identical to today. |
| **noindex header** | `X-Robots-Tag: noindex` emitted iff the active env's `noindex` facet is true (from the baked identity), NOT a hard-coded `=== 'staging'` comparison. |
| **`/api/version` `environment`** | The baked `name`. Frontend and server report the **same** name for the same image. |
| **Rollback** | A rolled-back image reports the environment it was built for (identity travels with the artifact). |

---

## Typed `env` accessor contract

Exposed to app code on **both** the server and the frontend:

| Member | Type | Semantics |
|---|---|---|
| `env.name` | string | baked env name, or `local` |
| `env.isPublicFace` | boolean | baked flag, or `false` (local) |
| `env.is(name)` | (string) ⇒ boolean | `name === env.name` |

- Server reads the baked `src/env.generated.ts` `BAKED`; frontend reads the inlined define token. They
  agree by construction (one `APP_ENV_NAME` resolution) and degrade together.
- **`local` fallback**: when no identity is baked (local `npm run dev`, un-built test contexts), the
  accessor returns the constant `{ name: 'local', isPublicFace: false, noindex: true }`. `local` is NOT
  a manifest entry — it is the "no deployment / no provenance" identity, distinct from the `dev` branch
  and the `staging` environment.
- **One source for `local`** (A1): the `local` constant is defined once as `LOCAL` in
  `src/environments.ts`. Server-side fallbacks import it. The frontend cannot import a `.ts` module
  through Vite `define`, so its inline `local` literal MUST mirror `src/environments.ts`'s `LOCAL`
  exactly — the same mirror discipline `vite.config.ts` and `scripts/prerender.mjs` already follow for
  the version globals.

---

## Default-path equivalence (byte-identical guarantee)

For the default manifest (production/`main`, staging/`dev`), the resolved build-args MUST reproduce
today's behavior exactly:

| Target | `APP_ENV_NAME` | resolved `isPublicFace` | resolved `noindex` | Chip | `/api/version` env | noindex header |
|---|---|---|---|---|---|---|
| production | `production` | `true` | `false` | hidden | `production` | none |
| staging | `staging` | `false` | `true` | shown | `staging` | `noindex` |
| local dev | (unset) | — (`local` fallback) | — | shown | `local` | (n/a locally) |

The production column MUST be byte-identical to the pre-feature production build/deploy (SC-001).

---

## Consumers of this contract

- `cloudbuild.yaml` — passes `_APP_ENV_NAME` (and the resolved `APP_IS_PUBLIC_FACE`) as build-args;
  runtime env carries the same name as a pass-through.
- `Dockerfile` — `ARG APP_ENV_NAME`; threads into the build step.
- `vite.config.ts` + `scripts/prerender.mjs` — resolve facets from the manifest by name; bake the
  frontend identity; mirror each other (incl. the inline `local` literal mirroring `LOCAL`).
- A build step (in `scripts/build.mjs`) — resolves `APP_ENV_NAME` against the manifest and writes
  `src/env.generated.ts` (`export const BAKED = {...}`) before `tsc` compiles the server. The file is
  committed with a default `local` identity (so the static import always resolves) and overwritten by
  the build; it is in `.prettierignore` (content varies per build). Local dev keeps the `local`
  default.
- `src/environments.ts` — the shared typed manifest reader + the `LOCAL` constant (the one source).
- `src/env.ts` / `src/web/env.ts` — the server and frontend accessors. Server reads `BAKED` (or
  `LOCAL`); frontend reads the define token (or the mirrored `local` literal).
- `src/server.ts` — noindex middleware reads the baked `noindex` facet (`BAKED.noindex`).
- `src/version.ts` — reports `environment` from the baked identity (`BAKED.name`).
