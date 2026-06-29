# Quickstart: Declarative N-Environment Manifest

How to use the environment manifest and how to verify the feature end-to-end. References
[contracts/versioning.md](./contracts/versioning.md) and [contracts/env-identity.md](./contracts/env-identity.md)
for the normative detail.

---

## Using it (the everyday path)

**Do nothing.** The template ships `environments.json` with the default two environments
(production/`main`, staging/`dev`). An app that never edits it behaves exactly as before.

**Add an environment** (e.g. `qa`):

1. Add one row to `environments.json`:
   ```jsonc
   { "name": "qa", "branch": "qa", "isPublicFace": false, "noindex": true, "tagSuffix": "-qa" }
   ```
2. Create and push the `qa` branch.
3. That's it for the template's reusable half — the derivation, workflow, chip, noindex, and baked
   identity all pick `qa` up from the manifest. (The per-app deploy job still needs its `qa` Cloud Run
   service/host wired — that is per-app, documented in `DEPLOY.md`, not in the manifest.)

**Read the current environment in app code**:

```ts
import { env } from './env';          // server  (or './web/env' in the frontend)
if (env.is('qa')) { /* show the qa-only thing */ }
if (!env.isPublicFace) { /* dev affordance */ }
```

Locally (`npm run dev`) `env.name` is `local`.

---

## Verifying the feature

### V1 — Default path is byte-identical (US1 / SC-001)

```bash
npm run check:all            # lint, format, typecheck, tests
npm run test:release         # the derivation behavior matrix
```

- Confirm the derivation matrix passes (all behaviors in [contracts/versioning.md](./contracts/versioning.md)).
- Build the production-default and a staging-style image; confirm the production column of the
  equivalence table in [contracts/env-identity.md](./contracts/env-identity.md): chip hidden, no
  `noindex`, `/api/version` reports `production`. Staging: chip shown, `noindex`, reports `staging`.

**Expected**: identical to the pre-feature template.

### V2 — Add an environment touches only the manifest (US2 / SC-002)

In a test fixture, add a `qa` row to `environments.json` and push a `qa` branch.

- `git diff` shows **only** `environments.json` changed (plus the new branch) to make `qa` work in the
  reusable half — no edit to `derive-version.sh`, the workflow, `server.ts`, or `vite.config.ts`.
- Derive on `qa` → `v<MM>.<patch>-qa`.
- Build with `APP_ENV_NAME=qa` → the image reports `qa` (frontend accessor + `/api/version`), serves
  `noindex`, shows the chip.

**Expected**: a third environment works with a one-file edit.

### V3 — Suffix-agnostic reuse / three envs share a number (US2 AS-3 / SC-003)

Run the matrix rows B4, B5, **B6** (three stand-in environments on one commit all reuse the same
number with their own suffixes). Confirm no environment mints a second number for a commit that already
has one.

**Expected**: B6 yields `v<MM>.N-a` and `v<MM>.N-c` for the same `N`.

### V4 — Accessor agrees across server & frontend; `local` fallback (US3 / SC-004)

- Build an image for `staging`; read the accessor server-side and in the prerendered/hydrated frontend
  → both report `staging`.
- Run `npm run dev` (no build-arg) → the accessor reports `local`.
- Roll an image back to a prior revision → it reports the environment it was built for.

**Expected**: 100% server/frontend agreement; `local` locally; identity travels with the artifact.

### V5 — Non-environment branch short-circuits (US2 AS-4 / SC-005)

Push a branch not in the manifest.

- `resolve-env` finds it is not an environment → the workflow short-circuits (no tag, no deploy), and
  does **not** fail.

**Expected**: clean no-op.

### V6 — Documented upgrade for a pre-feature app (US4 / SC-007)

Against a pre-feature app layout, follow only the documented upgrade steps in `DEPLOY.md`.

- The app gains `environments.json` seeded with its current two environments and the four de-hardcoded
  edits.
- Its default-path behavior matches V1.

**Expected**: an in-flight app reaches the new model by documentation alone.

### V7 — Matrix does not grow with environments (SC-006)

Count the scenarios in `scripts/derive-version.test.sh`. Add an environment to a fixture app. Re-count.

**Expected**: the scenario count is unchanged — the matrix is sized by behaviors, not environments.

### V8 — No spec citations in shipped files (SC-008 / Principle VIII)

```bash
grep -rni "FR-[0-9]\|spec 00\|speckit\|constitution principle" \
  --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.sh" \
  --include="*.json" --include="*.yaml" --include="*.yml*" --include="Dockerfile" \
  --include="*.md" . | grep -v "/specs/" | grep -v "/.specify/" | grep -v "/.claude/"
```

**Expected**: no matches in shipped files (`environments.json`, scripts, configs, `DEPLOY.md`).
