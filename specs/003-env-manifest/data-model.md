# Data Model: Declarative N-Environment Manifest

**Phase 1 output.** The "data" here is configuration, not persisted records: the `environments.json`
manifest and the in-memory shapes derived from it. No database, no migrations.

---

## Entity: Environments Manifest (`environments.json`)

The single declarative source of truth — a root-level JSON array of environment entries. Read by Node
consumers (via a typed wrapper, `src/environments.ts`) and by the shell derivation (via `node -p`).

**Shape**: a JSON array of [Environment Entry](#entity-environment-entry) objects, optionally with a
small format header. The minimal default shape:

```jsonc
// environments.json — DEFAULT (describes today's two environments exactly)
[
  { "name": "production", "branch": "main", "isPublicFace": true,  "noindex": false, "tagSuffix": ""     },
  { "name": "staging",    "branch": "dev",  "isPublicFace": false, "noindex": true,  "tagSuffix": "-dev" }
]
```

**Validation / rules**:
- The default ships these exact two entries, app-agnostic (no app name, no deploy coordinates). It is
  identical in the template and every spun app; `init.mjs` never touches it.
- No facet-coherence validation: every facet combination is accepted (facets are orthogonal).
- Duplicate `tagSuffix` across entries → **non-blocking warning** (legibility footgun, not an error).
- Branch lookup is exact-match by `branch`. An unknown branch at derivation time → **hard error**
  (the derivation cannot know which suffix to stamp).
- `name` is a human-readable handle with no enforcement weight; editing it is allowed and always
  coherent.

---

## Entity: Environment Entry

One row of the manifest — a named, deployable environment and its orthogonal facets.

| Field | Type | Meaning | Consumed by |
|---|---|---|---|
| `name` | string | The environment's identity (e.g. `production`, `staging`, `qa`). Reported by `/api/version` and the `env` accessor. | accessor, version report, build (baked) |
| `branch` | string | The git branch that drives this environment (exact match). | derivation (suffix lookup, branch validity), `resolve-env` |
| `isPublicFace` | boolean | Whether this build is the public face (hide dev-only affordances; the version chip is its sole member today). | build → `APP_IS_PUBLIC_FACE` → chip |
| `noindex` | boolean | Whether to emit `X-Robots-Tag: noindex`. | server middleware (from baked identity) |
| `tagSuffix` | string | The suffix stamped on this environment's derived tags (`""` for the public/prod env, `-dev`, `-qa`, …). | derivation (stamp), tag parser (read-back) |

**Notes**:
- The **production** environment is simply the entry with `isPublicFace: true` and `tagSuffix: ""`; it
  is not otherwise privileged.
- The entry carries **identity + facets only** — never per-app deploy coordinates (Cloud Run service
  name, host, project). Those stay in the per-app deploy job, documented (Principle III).
- Facets are independent. `{ isPublicFace: true, noindex: true }` ("public but don't index") is
  unusual-but-valid, not rejected.

---

## Entity: Environment Facet

An orthogonal, single-purpose switch on an environment. Not a separate object — the named columns above
(`isPublicFace`, `noindex`, `tagSuffix`). Listed here to name the design property:

- **Orthogonality**: each facet controls exactly one mechanism (a build constant, a header, a tag
  suffix) with no cross-facet rule. No combination is undefined.
- **Build-time vs runtime kind**: `isPublicFace` is baked into the frontend bundle (the chip is in the
  static JS). `noindex` is honored by the server but, post-feature, is read from the **baked** identity,
  not a live runtime var. `tagSuffix` is CI-time (the derivation).
- **Extensible**: new facets (e.g. a future `debug`) are added as new columns with a consumer; the
  vocabulary is template-owned because each facet needs code to honor it.

---

## Entity: Baked Environment Identity

The environment `name` plus its resolved facets, fixed at build time and embedded in the artifact — the
provenance "serial number." Immutable for the life of the image.

**How it is produced**:
1. CI/deploy passes a single `APP_ENV_NAME` build-arg (the environment *name*).
2. The build resolves that name against `environments.json` to obtain the facets (`isPublicFace`,
   `noindex`, `tagSuffix`).
3. The identity is inlined into the **frontend bundle** (Vite `define` token) and into the **compiled
   server**, so both render contexts read the same value.

**Properties**:
- Immutable: changing an image's environment requires a rebuild (no runtime relabel).
- Consistent: frontend and server cannot disagree (one baked source).
- Rollback-coherent: a rolled-back image reports the environment it was built for.

---

## Entity: `local` Fallback Identity

A hard-coded constant identity returned by the `env` accessor when **no** identity was baked (local
`npm run dev`, un-built test contexts). **Not a manifest entry.**

```jsonc
{ "name": "local", "isPublicFace": false, "noindex": true }
```

- Distinct from the `dev` branch and the `staging` environment.
- Not deployable, mints no tags, has no branch — which is exactly why it is a constant, not a row (the
  branch-lookup and derivation never encounter it).

---

## Entity: Derived Version Tag

A git tag `<prefix><MM>.<patch><suffix>` — the release identity for one build of one number.

| Part | Source | Notes |
|---|---|---|
| `prefix` | tag-format parameter | default `v` |
| `MM` | `package.json` MAJOR.MINOR | the patch field in `package.json` is ignored |
| `patch` | derived global build id | global, monotonic; reused on a commit that already has a number, else global-max + 1 |
| `suffix` | the pushing environment's `tagSuffix` | `""` for prod, `-dev`/`-qa`/… for others |

**Rules**:
- The `patch` is never committed (lives only in tags + the built image + `/api/version`).
- No two distinct commits share a `patch` (Invariant 1).
- The read-back parser is generated from `prefix`/`suffix`, so it cannot drift from the renderer.

---

## Entity: Typed Environment Accessor (`env`)

The in-memory object app code reads (server and frontend) to branch on the current environment.

| Member | Type | From |
|---|---|---|
| `env.name` | string | baked identity, or `local` fallback |
| `env.isPublicFace` | boolean | baked identity, or `false` (local) |
| `env.is(name)` | (string) → boolean | `name === env.name` |

- Server reads it from the baked server-side identity; frontend reads it from the inlined define token.
- They agree by construction (same baked source) and degrade to `local` together when un-built.

---

## Relationships

```text
environments.json (array)
  └── Environment Entry (1..N)          name, branch, isPublicFace, noindex, tagSuffix
         ├── drives ──▶ git branch       (resolve-env + derivation look up by branch)
         ├── stamps ──▶ Derived Tag      (tagSuffix on the global patch number)
         └── baked  ──▶ Baked Identity   (APP_ENV_NAME → resolve facets → inline into bundle + server)
                            └── read by ──▶ Typed Accessor (env)  [or `local` constant when unbaked]
                                              ├── chip       (isPublicFace)
                                              ├── noindex    (noindex facet)
                                              └── /api/version (name)
```
