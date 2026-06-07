# Deploying

This app deploys to **Google Cloud Run**, fronted by a **global external HTTPS load
balancer**. Apps can share one GCP project (each its own Cloud Run service + subdomain on
the shared LB). The deploy model below is **as-built and proven** — it's what actually
works end to end, distilled from standing up the first app in the project.

Placeholders used throughout: `<project>` (GCP project id), `<service>` (Cloud Run service
= app name), `<owner>/<repo>` (GitHub repo), `<region>` (e.g. `us-central1`), `<LB-IP>`
(the load balancer's static IP), `<deployer-SA>` (the build/deploy service account),
`<project-number>` (numeric GCP project number).

## The model in one paragraph

Push to `main` → CI runs the quality gate, bumps the patch version, and pushes a `vX.Y.Z`
tag → a **chained deploy job in the same workflow run** authenticates to GCP via **Workload
Identity Federation** (keyless — no stored JSON key) and runs a Cloud Build that builds the
`Dockerfile` and deploys to Cloud Run. No manual step, no second event, no long-lived
secret. A `vX.Y.Z` tag means "passed checks and deployed."

> **Use GitHub Actions, not a Cloud Build tag-trigger.** The "obvious" model — a Cloud
> Build GitHub trigger that watches for tag pushes — was tried and **abandoned**: the
> webhook events never arrive (delivery breaks at Google's side; not fixable from the CLI,
> and not caused by org policy / SA / region / regex — all ruled out). The chained
> GitHub Actions job below is the reliable path. See [Known-broken: Cloud Build
> trigger](#known-broken-cloud-build-tag-trigger) before you reach for one.

---

## TL;DR — ship a change

1. Commit to `main` and push. CI (`.github/workflows/main.yml`) runs `npm run check:all`,
   bumps the patch version, pushes a `vX.Y.Z` tag, then the chained `deploy` job builds and
   deploys. That's the whole flow.
2. Verify through the load balancer (NOT the `*.run.app` URL — it's 404 by design):

   ```bash
   curl -s --resolve <host>:443:<LB-IP> https://<host>/api/version
   ```

   `/api/version` returns `{number, commit, buildDate, environment}` — the runtime record
   of what's actually deployed (number = tag, commit = short SHA, buildDate = real ISO
   timestamp).

**Manual deploy** anytime (no CI involved): `./scripts/deploy.sh <service> <project>
<region>`. This runs `gcloud run deploy --source .` (Dockerfile is the whole build
definition; no `cloudbuild.yaml` needed for this path). It sets runtime env vars but can't
forward git metadata into the Docker build — see [Build command](#build--deploy-command).

---

## The deploy pipeline (`.github/workflows/main.yml`)

One workflow, chained jobs, on push to `main`:

1. `validate` (on PRs) / `version-and-tag` (on push): runs `npm run check:all`; on push,
   bumps the patch version, commits `chore: release vX.Y.Z [skip ci]`, pushes the tag.
2. `deploy` (`needs: version-and-tag`, **same run**): authenticates via WIF, then builds +
   deploys the tagged commit.

**Why deploy is a chained job, not a separate `on: push: tags` workflow:** a tag pushed
with `GITHUB_TOKEN` does **not** emit an event that triggers another workflow (GitHub's
recursion guard). A standalone tag-triggered deploy workflow would never fire. Chaining via
`needs:` runs the deploy in the same run — no second event required, and it works with the
default `GITHUB_TOKEN` (so `RELEASE_TOKEN` is _not_ needed for this model; see the note in
the workflow file for the one case it is).

> The template ships the `version-and-tag` half. The `deploy` job is **per-app** (it
> references your project, service account, and WIF provider), so add it when you wire the
> app to GCP — using the auth + build steps documented here.

---

## One-time CI setup (per repo)

The release workflow pushes a version-bump commit and a tag back to `main`. That requires
the repo to allow Actions to write:

```bash
gh api -X PUT repos/<owner>/<repo>/actions/permissions/workflow \
  -f default_workflow_permissions=write
```

(Or web UI: **Settings → Actions → General → Workflow permissions → "Read and write
permissions" → Save**.)

**Set this _before_ the first push to `main`.** The first push triggers the release
workflow, which tags on success — if write permission isn't enabled yet, the gate passes
but the tag step fails with a 403. (Fix: enable the setting, then re-run the failed job or
push again.) The CLI command needs a token with admin rights on the repo.

`RELEASE_TOKEN` is **not** required for the recommended model — the chained deploy job
needs no second event. Only set it if something _external_ watches for the tag push (a
separate `on: push: tags` workflow, or a Cloud Build trigger). See the comment on the
checkout step in `.github/workflows/main.yml`.

---

## One-time GCP setup (per app)

In dependency order. Most of this is one-time _per project_ and reused by every app; the
genuinely per-app bits are flagged.

### 1. APIs

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com compute.googleapis.com \
  iamcredentials.googleapis.com secretmanager.googleapis.com \
  cloudresourcemanager.googleapis.com --project=<project>
```

(Run + Cloud Build + Artifact Registry for the build/deploy. Compute for the load balancer.
IAM Credentials for WIF. Secret Manager + Resource Manager for the optional connected-repo
link / any 2nd-gen Cloud Build resources.)

### 2. Workload Identity Federation (keyless auth — no JSON key anywhere)

One pool/provider serves the whole project; reuse it for every repo.

```bash
# Pool + provider (issuer = GitHub's OIDC), restricted to your GitHub org/owner:
gcloud iam workload-identity-pools create github-pool \
  --project=<project> --location=global --display-name="GitHub pool"
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project=<project> --location=global --workload-identity-pool=github-pool \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == '<owner>'"
```

Then let **only this repo** impersonate the deploy SA (per-app — one binding per repo):

```bash
gcloud iam service-accounts add-iam-policy-binding <deployer-SA> \
  --project=<project> --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/<project-number>/locations/global/workloadIdentityPools/github-pool/attribute.repository/<owner>/<repo>"
```

### 3. Deploy service account (user-managed — required)

A build that runs with an **explicit** `--service-account` must use a **user-managed** SA;
the Google-managed Cloud Build SA (`…@cloudbuild.gserviceaccount.com`) is rejected at run
time with `INVALID_ARGUMENT: provide a user-managed service account`.

```bash
gcloud iam service-accounts create <name> --project=<project> \
  --display-name="Tag deploy (Cloud Build)"   # => <deployer-SA>
```

Project roles it needs: `roles/run.admin`, `roles/cloudbuild.builds.editor`,
`roles/artifactregistry.writer`, `roles/storage.admin`, `roles/logging.logWriter`
(required because the build uses `logging: CLOUD_LOGGING_ONLY`).

`actAs` (`roles/iam.serviceAccountUser`) bindings — **both** matter:

```bash
# (a) on the compute runtime SA — Cloud Run runs the service as the compute SA:
gcloud iam service-accounts add-iam-policy-binding \
  <project-number>-compute@developer.gserviceaccount.com \
  --project=<project> --role="roles/iam.serviceAccountUser" \
  --member="serviceAccount:<deployer-SA>"

# (b) on ITSELF — the workflow authenticates AS <deployer-SA> (via WIF) and then submits a
#     build that runs AS <deployer-SA>; without self-actAs the submit fails with
#     "PERMISSION_DENIED: caller does not have permission to act as service account".
gcloud iam service-accounts add-iam-policy-binding <deployer-SA> \
  --project=<project> --role="roles/iam.serviceAccountUser" \
  --member="serviceAccount:<deployer-SA>"
```

### 4. Cloud Run service hardening (per app)

Deploy the service with **`--ingress=internal-and-cloud-load-balancing`** so it rejects
direct `*.run.app` traffic and the load balancer is the only front door. **Consequence:**
the `run.app` URL returns **404 by design** — always test through the LB / your hostname,
never `run.app`. `--allow-unauthenticated` for a public site (the ingress lock is about
_path_, not _authz_).

### 5. Load balancer + domain (one-time per project, shared by all apps)

Cloud Run's built-in domain mapping **can't serve an apex domain** and **isn't GA in every
region** (e.g. `us-central1`), so it's the wrong tool for a custom/apex domain. Stand up a
**global external HTTPS load balancer** once; every app rides it on a different hostname.

Resources (one set per project): a global static IP (`<LB-IP>`, the DNS target), a
serverless NEG → backend service → URL map → managed cert → HTTPS proxy + forwarding rule
(:443), plus an HTTP forwarding rule (:80) that 301-redirects to HTTPS.

DNS (at your registrar): `A @ → <LB-IP>`, `CNAME www → <host>`. **Leave MX records alone**
(Workspace email). A Google-managed cert only goes `ACTIVE` after DNS resolves to the IP
(~15–60 min). A static public IP is expected — security is at the LB edge (managed TLS,
HTTPS-only, baseline DDoS), not from hiding the IP.

**Cost reality:** the LB forwarding rule is a flat **~$18/mo baseline per load balancer**,
regardless of traffic. Because one LB fronts every app in the project, the 2nd…Nth app adds
**~$0**.

---

## Build & deploy command

CI deploys by submitting a Cloud Build, run **AS `<deployer-SA>`** (not the default compute
SA). The default shape — a plain local submit (`.` as the source), which needs **no Cloud
Build repo connection**:

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=TAG_NAME=vX.Y.Z,SHORT_SHA=<shortsha> \
  --service-account=projects/<project>/serviceAccounts/<deployer-SA> \
  --default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET \
  --project=<project> --region=<region> .
```

This deploys the same image **given the same source tree** — but note it builds from the
working tree (uploaded as a tarball), not the tagged commit, so check out the tag first or
you'll build whatever's on disk. The per-app **Tags** and **Images** columns come from
`cloudbuild.yaml` and work regardless; only the History **Ref** column is lost. If you want
the Ref column too, swap the final `.` for the connected-repo resource and add
`--revision=vX.Y.Z` (see [Connected-repo link](#connected-repo-link-ref-column)).

> The app's CI actually uses the **connected-repo** path (deterministic — it pulls the
> tagged commit). The plain `.` submit above is the simpler, connection-free alternative;
> it's documented but not the path CI exercises, so verify it on first use.

Non-obvious flags, each learned the hard way:

- **`--service-account`** — `gcloud builds submit` does **not** auto-run as the calling
  identity. Without this, the build runs as the default compute SA. Set it to `<deployer-SA>`.
- **`--default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET`** — **required** whenever a
  user-managed `--service-account` is set on a regional build, or the submit errors on the
  logs bucket.
- **`gcloud run deploy` has no `--substitutions`** — that's why the `--source` wrapper can't
  pass git metadata into the build. Use `gcloud builds submit` for any control over the
  build (e.g. forwarding `BUILD_GIT_COMMIT` / `BUILD_DATE`).

### `cloudbuild.yaml` (per app — the template doesn't ship one)

The tag-deploy needs a build config (the implicit `--source .` build can't forward
build-args or set image tags). It should:

1. **Build the `Dockerfile`**, forwarding the tagged commit and a build timestamp so the
   **frontend** bundle carries real values, not just the server: `--build-arg
BUILD_GIT_COMMIT=$SHORT_SHA --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)`.
   (Use an actual ISO timestamp for `BUILD_DATE` — **not** `$TAG_NAME`; a tag like `v1.2.3`
   is a version, not a date. The server's `/api/version` reads its values from runtime env
   vars; the frontend chip's commit/date come from these Docker build-args.)
2. **Push** to Artifact Registry, tagging the image `<service>:vX.Y.Z-<shortsha>` so app +
   version + commit are legible in one place.
3. **`gcloud run deploy`** the image, setting runtime env (`APP_VERSION`, `BUILD_GIT_COMMIT`,
   `BUILD_DATE`, `NODE_ENV=production`) — mirroring `scripts/deploy.sh`.
4. Use `options: logging: CLOUD_LOGGING_ONLY` (hence the SA's `logging.logWriter` role), and
   set `images:`/`tags:` so Cloud Build History stays filterable (see below).

It's app-specific (service, region, project), which is why it isn't in the template.

### Cloud Build History legibility

Builds from many apps interleave in one project's History. To keep them filterable:

| History column    | What populates it                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Images**        | The `images:` list in `cloudbuild.yaml` — tag `<service>:vX.Y.Z-<shortsha>`.                                                                                                                             |
| **Tags / filter** | The `tags:` block — e.g. `app-<service>`, `ref-vX.Y.Z`, `commit-<shortsha>`. Filter via `gcloud builds list --filter='tags=app-<service>'`. (Tag values can't contain `/` or `=`; use `key-value` form.) |
| **Ref**           | Blank for the default local submit. Populated only by submitting from a **connected repo** with `--revision=vX.Y.Z` — an opt-in add-on, see below.                                                       |

---

## Connected-repo link (Ref column)

**Opt-in — skip it unless you want the History Ref column.** A 2nd-gen Cloud Build **repo
connection** lets you submit `--revision=vX.Y.Z` from the connected repo so History's
**Ref** column shows the tag. It is **only** a build _source_ — **not** a trigger, and it
does **not** depend on webhook delivery. The default local submit deploys identically
without it (and still gets the Tags/Images columns); the connection adds nothing but Ref.
To use it, swap the final `.` in the build command for the connected-repo resource.

Creating the connection needs a **one-time browser OAuth** the CLI can't do:

```bash
gcloud builds connections create github <conn-name> --region=<region> --project=<project>
# returns a PENDING_USER_OAUTH link → open it (correct Google + GitHub identities) →
# advance to PENDING_INSTALL_APP → SELECT THE EXISTING GitHub App installation and Continue
# (do NOT "install in another account") → COMPLETE
gcloud builds repositories create <repo> --connection=<conn-name> \
  --region=<region> --project=<project> \
  --remote-uri="https://github.com/<owner>/<repo>.git"
```

Prereq: the Cloud Build P4SA
(`service-<project-number>@gcp-sa-cloudbuild.iam.gserviceaccount.com`) needs
`roles/secretmanager.admin` (2nd-gen stores the OAuth token in Secret Manager).

---

## Adding another app to the same project (the fleet pattern)

The project hosts many apps; each is its own repo → Cloud Run service → subdomain on the
shared LB. Per new app `<app>`:

1. **WIF binding** — reuse the existing pool/provider (the owner condition already allows
   all your repos); add one `roles/iam.workloadIdentityUser` binding for
   `…/attribute.repository/<owner>/<app>` on its deploy SA (reuse `<deployer-SA>` or make a
   per-app one).
2. **Cloud Run** — deploys as a separate service `<app>`; no conflict. Lock its ingress (§4).
3. **Artifact Registry** — images namespaced by service automatically.
4. **Load balancer** — add a serverless NEG + backend + host-rule on the existing URL map
   for `<app>.<host>`, add the hostname to the managed cert, add one `A` record for the sub
   → same `<LB-IP>`. **No new LB, no new IP, ~$0 added.**
5. **Connected-repo link** (optional, Ref column only) — link `<app>` under the existing
   connection.
6. **Workflow** — copy `.github/workflows/main.yml` and the per-app `deploy` job, changing
   `SERVICE`, the WIF principal, and the host.

---

## Staging environment (recommended)

> **Recommendation, not yet as-built.** Everything above is proven end to end on the first
> production app. The staging model below follows directly from the same primitives (a 2nd
> Cloud Run service on the shared LB, the existing version/tag flow) but hasn't been stood
> up yet — treat it as the design to follow, and promote a paragraph here to "as-built" once
> you've run it. It changes no template source; it's branch + per-app deploy wiring.

A staging environment is **a second deploy of the same app, off a second long-lived
branch, to a second Cloud Run service on the same load balancer** — production on
`snackbyte.io`, staging on `snackbyte.dev`. Same project, same LB, same pipeline shape;
only the branch, the service name, the hostname, and the environment label differ.

### The model in one paragraph

Two long-lived branches: `main` → **production**, `dev` → **staging**. Both branches
auto-tag and auto-deploy on push exactly as `main` does today — same `check:all` gate, same
chained deploy. The one difference is **where the patch bump lives: `dev` owns it.** Push to
`dev` runs the gate, bumps the patch version, and pushes a **`vX.Y.Z-dev`** tag → a chained
deploy job (identical to production's, different inputs) deploys to the
**`<service>-staging`** Cloud Run service on **`<app>.snackbyte.dev`**. A `vX.Y.Z-dev` tag
means "passed checks and is live on staging." You promote by merging `dev` into `main`; that
push runs the prod gate and **deploys the version `dev` already set** — `main` does **not**
bump again. So `main` → `vX.Y.Z` → `<service>` on `<app>.snackbyte.io` ships the finalized
form of the number staging already validated.

### Who owns the version bump

**Exactly one branch bumps the patch — the leading edge of the version stream — and which
one depends on whether staging exists:**

- **No staging (main only):** `main` owns the bump. Push to `main` → gate → patch bump → tag
  `vX.Y.Z` → deploy. This is today's behavior, unchanged. (`AUTO_BUMP=true` on `main`.)
- **Staging exists (`dev` + `main`):** **`dev` owns the bump; `main` stops bumping.** The
  number is minted once on `dev`, validated on staging, then carried to prod by the merge.
  `main` still auto-tags and auto-deploys on push — it just skips the `npm version` step and
  ships the version already in `package.json`. (`AUTO_BUMP=true` on `dev`, `false` on `main`.)

This keeps the version **monotonic across one stream** instead of two branches racing to bump
it. A number is born on `dev`, proven on staging, and released on `main` as the same number —
never bumped twice, never forked.

### Why two branches (and not env-from-tag)

The branch _is_ the environment selector — it's the one signal both humans and CI read the
same way. `dev` is always "what's on staging"; `main` is always "what's in prod." A push to
either deploys exactly one environment, so there's never ambiguity about where a commit
landed. The cost is keeping two branches in sync — but that sync (merge `dev` → `main`) **is
the promotion gate**, which is what you want a staging environment to give you.

### Tags: `vX.Y.Z` (prod) vs `vX.Y.Z-dev` (staging)

`dev` bumps the patch and tags the result with a **`-dev` suffix**; `main` ships the **same
number without the suffix**. One bump, two tags on one number — staging gets `vX.Y.Z-dev`,
prod gets `vX.Y.Z` when the merge lands. The suffix is purely a label: a glance at a tag says
which environment it shipped to, and the two never collide in the tag namespace.

The cleanest way to get a flat **`vX.Y.Z-dev`** is to bump in `package.json` and append the
suffix only on the staging _tag_, leaving the stored version a plain release number:

```bash
# on dev — bump package.json to the next plain patch, tag it -dev:
npm version patch --no-git-tag-version    # package.json: 1.4.0 -> 1.4.1
VERSION="$(node -p "require('./package.json').version")"   # 1.4.1
git tag -a "v${VERSION}-dev" -m "Staging v${VERSION}-dev"  # tag: v1.4.1-dev
# package.json now holds 1.4.1 — the exact number main will release as v1.4.1 on merge.
```

Storing the **plain** number (`1.4.1`, not `1.4.1-dev`) is what lets `main` release it as
`v1.4.1` with **no bump of its own** — it just tags `v$(version)` and deploys. (If you stored
a `1.4.1-dev.0` prerelease string in `package.json` instead, `main` would have to strip the
suffix before tagging — extra logic for no gain. Keep the stored version a clean release
number; the `-dev` lives only on the staging tag.)

> **Version-line drift, same rule as prod.** If a staging bump fails on "tag already exists,"
> `package.json` on `dev` has fallen behind its tags — reset it to match the highest existing
> tag. Because only `dev` bumps, `main` can't drift on its own; it inherits whatever `dev`
> set, so the streams can't fork.

### What the app reports — `environment: staging`

The server's `/api/version` returns `environment` straight from `NODE_ENV` (see
`src/version.ts`). Today both prod and staging would build/run with `NODE_ENV=production`, so
staging would mislabel itself as `production`. Making staging legible has a **sharp edge in
the current `version.ts` — read this before reaching for the obvious knob:**

> **Don't just set `NODE_ENV=staging`.** `version.ts` derives _two_ things from `NODE_ENV`:
> `environment` (the label) **and** `isBuild` — `const isBuild = CI === 'true' || NODE_ENV
=== 'production'`. The server runtime doesn't set `CI`, so it relies on `NODE_ENV ===
'production'` to make `isBuild` true and read the **real** `APP_VERSION`. Flip `NODE_ENV` to
> `staging` and `isBuild` goes **false** → `number` silently falls back to `0.0.0-dev`. So the
> one-liner that fixes the label **breaks the version number**. Pick one of the two correct
> paths below instead.

- **Path A — separate `APP_ENV`, leave `NODE_ENV=production` (smallest, safest):** keep
  `NODE_ENV=production` on the `-staging` service (so `isBuild` stays true and `number` is
  real) and set `--set-env-vars APP_ENV=staging`. **The template already reads the label this
  way** — `version.ts` resolves `environment` as `APP_ENV ?? NODE_ENV ?? 'development'`, so
  setting `APP_ENV=staging` is **all you do**, no source change. It decouples "what to report"
  from "is this a release build." This is the recommended path.
- **Path B — keep `NODE_ENV=staging`, broaden `isBuild`:** if you'd rather the env var _be_
  `NODE_ENV=staging`, also change `isBuild` so a non-`production` deploy still counts as a
  build — e.g. key it on `CI === 'true' || APP_VERSION present` or `NODE_ENV !==
'development'`. More moving parts than Path A; only worth it if something else keys off
  `NODE_ENV === 'staging'`.

Either way `/api/version` then reports `environment: "staging"` **with the real number**.
Note Cloud Run's `--set-env-vars` overrides the `Dockerfile`'s `ENV NODE_ENV=production` at
runtime, so the deploy-time var wins — that's the mechanism both paths rely on.

**The version chip (frontend) is keyed off the _build_, not runtime.** The chip hides when
`__IS_PRODUCTION__` is true, and the `Dockerfile` hardcodes `NODE_ENV=production` for the
build stage (so the chip is hidden on _both_ prod and staging as shipped). If you want the
chip **visible on staging** (the usual reason to have a chip), the staging build must pass a
non-production signal into the build stage — e.g. a `--build-arg` the `Dockerfile` maps to
`__IS_PRODUCTION__=false` for staging — rather than reading `NODE_ENV`. This is the one spot
where "staging" needs a **build-arg**, not just a runtime var (the chip is baked at build
time; `version.ts`'s `environment` is read at runtime). Wire it per app if you want the chip
on staging, or leave it and rely on `/api/version` + the hostname to tell prod from staging.

### GCP wiring (per app — reuses the project & LB)

Staging is just another service on the existing fleet pattern (§"Adding another app"),
pointed at the `.dev` TLD. **One global external HTTPS LB serves both TLDs** — a single
managed cert (or cert map) holds hostnames across `snackbyte.io` _and_ `snackbyte.dev`, and
host-rules route each to its backend. No second LB, no second IP, **~$0 added** beyond the
prod app.

Per app, in addition to its production wiring:

1. **Cloud Run** — deploy a second service `<service>-staging` (same image build, different
   service + env). Lock its ingress to `internal-and-cloud-load-balancing` exactly like prod
   (§4) — staging is internet-reachable through the LB; the ingress lock is still about
   keeping `run.app` shut. Set the env label via `--set-env-vars APP_ENV=staging` (Path A
   above), **keeping `NODE_ENV=production`** so the version number stays real.
2. **Load balancer** — add a serverless NEG → backend for `<service>-staging`, a host-rule
   for `<app>.snackbyte.dev` on the existing URL map, and add that hostname to the managed
   cert (or cert map). The cert re-provisions to `ACTIVE` once the new DNS resolves.
3. **DNS** — one `A` record `<app>.snackbyte.dev → <LB-IP>` (the same LB IP as prod).
4. **WIF** — the existing owner-scoped pool/provider already allows the repo; the same
   `<deployer-SA>` (and its `actAs` bindings) deploys both services. No new IAM beyond what
   prod set up.
5. **Workflow** — add a `dev`-branch sibling to the chained deploy: same WIF auth + Cloud
   Build, with `SERVICE=<service>-staging`, the `.dev` host, and `APP_ENV=staging` (plus
   `NODE_ENV=production`, per Path A) in the run-deploy step. Gate it on
   `github.ref == 'refs/heads/dev'` (prod gates on `main`).

### Workflow shape (per app — the template ships only the prod-side gate)

The template's `.github/workflows/main.yml` triggers on `main` only. For staging, the
simplest path is a parallel trigger and a branch-keyed deploy. Sketch (per-app, not shipped):

```yaml
on:
  push:
    branches: [main, dev] # dev → staging, main → production
# version-and-tag: dev BUMPS the patch + tags vX.Y.Z-dev; main does NOT bump —
#                  it tags v$(package.json version) and deploys the number dev set.
# deploy (per app): two branch-keyed jobs (or one job with branch-conditional inputs):
#   - if: github.ref == 'refs/heads/dev'   → bump+tag -dev, SERVICE=<service>-staging, host=<app>.snackbyte.dev, APP_ENV=staging (NODE_ENV stays production)
#   - if: github.ref == 'refs/heads/main'  → tag only (no bump), SERVICE=<service>,    host=<app>.snackbyte.io,  (prod; no APP_ENV)
```

**`AUTO_BUMP` becomes branch-scoped: `dev` carries it, `main` doesn't.** With staging in
play, only `dev` runs the `npm version` step (and commits `chore: release … [skip ci]` so the
bump commit doesn't re-trigger). `main` keeps the gate, tag, and deploy but drops the bump
step. (Without staging, the flag stays on `main` exactly as the template ships it.) `[skip
ci]` still guards the one branch that commits a bump.

### Promotion & rollback

- **Promote** staging → prod: merge `dev` into `main`. The prod pipeline runs the gate again
  and tags `vX.Y.Z` — the **same number** `dev` already minted, suffix dropped, **no second
  bump**. (Re-certifying at the prod tag is the same independent-certification stance prod
  already takes; it just doesn't re-mint the version.)
- **Roll back** either environment: redeploy the previous image. Each Cloud Run service keeps
  its revision history; `gcloud run services update-traffic <service|service-staging>
--to-revisions=<prev>=100` flips back without a rebuild. The `vX.Y.Z[-dev]` tags map tags →
  images for finding the revision to pin.

---

## Known-broken: Cloud Build tag-trigger

**Do not use a Cloud Build GitHub trigger for tag-deploy in this setup.** Symptom: pushing
a `vX.Y.Z` tag never starts a build. Ruled out, with evidence: CI's `GITHUB_TOKEN` event
suppression (a tag pushed with a real-identity PAT _and_ a tag pushed from a local clone
both failed to fire); trigger config / regex (recreating fresh with `--tag-pattern='.*'`
didn't help); the build itself (`gcloud builds triggers run … --tag=vX.Y.Z` builds and
deploys every time). The connection reports `installationState: COMPLETE`, yet tag-push
webhooks don't reach the trigger — a **GitHub App → Cloud Build event-delivery** failure
that isn't introspectable from the CLI.

The **GitHub Actions + WIF chained-job** model at the top of this doc avoids the opaque
webhook entirely and keeps the whole release path in CI. That's the supported path.

---

## Operational gotchas

- **Version/tag drift** — if the release job fails on "tag vX.Y.Z already exists",
  `package.json` has fallen behind existing tags. Set `package.json` to match the highest
  existing `vX.Y.Z` tag so the next bump is fresh.
- **`gcloud` auth expiry** — tokens expire ~hourly; re-auth with `gcloud auth login
<account>` when commands fail with "Reauthentication required". Pass the right
  `--account` for the project (a machine may have multiple Google identities owning
  different projects — using the wrong one silently targets the wrong project).
- **`google-github-actions/*`** currently run on Node 20 (a deprecation warning; bump when
  convenient).
