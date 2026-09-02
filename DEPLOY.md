# Deploying

This app deploys to **Google Cloud Run**, fronted by a global external HTTPS load balancer
shared across the project's apps.

This document covers the half that is **this app's**: how a tag becomes a deploy, the `deploy`
job, the build arguments `cloudbuild.yaml` expects, and how `environments.json` becomes the
environment identity baked into the image. The two halves it does _not_ own:

| Half                                                                      | Owner                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| The release flow — versions, tags, promotion, repo settings               | `CONSUMING.md` in `jeff-fichtner/snackbyte-release-flow-action` |
| The GCP hosting itself — project, WIF, deploy SA, load balancer, TLS, DNS | `GCP-SETUP.md` in the `project-setup` repo                      |

Placeholders used throughout: `<project>` (GCP project id), `<service>` (Cloud Run service
= app name), `<owner>/<repo>` (GitHub repo), `<region>` (e.g. `us-central1`), `<LB-IP>`
(the load balancer's static IP), `<deployer-SA>` (the build/deploy service account),
`<project-number>` (numeric GCP project number).

## The model in one paragraph

The **branch selects the environment**, and the environments are declared in
**`environments.json`** at the repo root — the single source of truth. The default ships two:
`main` → production and `dev` → staging. On push, your CI workflow (added per repo — see below)
runs the quality gate and calls the **`snackbyte-release-flow-action`**, which tags the commit
if the branch is an environment and does nothing if it isn't. A chained `deploy`
job (per-app — see below) authenticates to GCP via **Workload Identity Federation** (keyless),
runs a Cloud Build (`cloudbuild.yaml`) that builds the `Dockerfile` and deploys to Cloud Run.
No manual version bump, no commit pushed back to the branch, no long-lived secret. A `vX.Y.Z`
tag means "passed checks and deployed to the public-face (production) environment";
`vX.Y.Z-dev` means "…to staging." **Adding an environment is a one-row edit to
`environments.json`** (then create/push its branch) — the derivation, the workflow, the chip,
the noindex header, and the baked identity all pick it up; only the per-app deploy job needs
the new environment's service/host wired (see "Adding a staging environment" below). The
environment an image belongs to is **baked at build time** (immutable, like a serial number),
so `/api/version` reports the environment the image was built for and the frontend and server
never disagree.

## Versioning and the release flow — owned by the Action

How a version is derived, why collisions are structurally impossible, why patch numbers have
gaps, how `dev` → `main` promotion reuses a number, and the two repo settings the flow needs
(the Actions write permission and branch protection) all belong to the release-flow Action.

**Read `CONSUMING.md` in `jeff-fichtner/snackbyte-release-flow-action`.** It is the single
source for that half, and nothing here restates it.

What matters for _this_ document: a tag is the deploy signal. `vX.Y.Z` means "passed the gate
and deployed to the public-face environment"; `vX.Y.Z-dev` means "…to staging." Everything
below is about what happens once a tag exists.

## TL;DR — ship a change

1. **To production:** commit to `main` and push. CI runs `npm run check:all`, derives + pushes a
   `vX.Y.Z` tag, then the chained `deploy` job builds and deploys.
2. **To staging:** commit to `dev` and push → `vX.Y.Z-dev` → staging on `<app>.snackbyte.dev`.
3. **Promote:** fast-forward `main` to the `dev` commit (the promotion gate — see the Action's
   `CONSUMING.md`) → prod on
   `<app>.snackbyte.io`, reusing the staging number.
4. Verify through the load balancer (NOT the `*.run.app` URL — it's 404 by design):

   ```bash
   curl -s --resolve <host>:443:<LB-IP> https://<host>/api/version
   ```

   `/api/version` returns `{number, commit, buildDate, environment}` — the runtime record of
   what's deployed. Staging additionally returns an `X-Robots-Tag: noindex` header; production
   does not.

**Manual deploy** anytime (no CI): `./scripts/deploy.sh <service> <project> <region> [version]`.
This runs `gcloud run deploy --source .`. The version is whatever you pass (or `git describe`),
not a `package.json` patch.

**Recovery — tag pushed but the deploy failed** (transient GCP/GitHub error): the tag exists but
prod wasn't updated, and re-running the whole workflow would hit the fail-loud "tag exists"
guard. Just **re-run the `deploy` job alone** against the existing tag — `deploy` keys off the
tag and doesn't re-derive, so the guard is never engaged. (A _code_ failure is instead fixed by a
new commit → new tag; the orphaned tag harmlessly becomes a build id with no deploy.)

## The CI workflow

**This app ships no workflow** — you add one per repo from the Action's `CONSUMING.md`, which
owns the recipe, the `@v1` pin, `fetch-depth: 0`, the job's `contents: write`, and the repo
settings. The rest of this document assumes the resulting workflow is named `ci-cd` and that
its tag job is `version-and-tag`.

The one job `CONSUMING.md` does **not** give you is `deploy` — it is per-app, because it names
your GCP project, service account, and Workload Identity provider, and resolves the target from
`environments.json`. That job is this document's job, and the snippet is below.

## The hosting it deploys onto — owned by the setup runbook

Cloud Run behind a shared global HTTPS load balancer. Standing that up — project APIs, keyless
CI auth via Workload Identity Federation, the deploy service account, Cloud Run's ingress and
invoker settings, the load balancer, TLS, and DNS — is **one-time, per-project infrastructure**
that has nothing to do with this app in particular. It would read identically for a Go service
or a static site.

**It lives in `GCP-SETUP.md` in the `project-setup` repo**, alongside the setup checklist that
sequences it. Do it once for the project; each additional app then costs one NEG, one backend,
one host rule, and one DNS record.

What follows here is the half that _is_ specific to this app: the `deploy` job that consumes
those values, and the build arguments this repo's `cloudbuild.yaml` expects.

## The `deploy` job + Cloud Build (per app)

The template ships `cloudbuild.yaml` and the `validate` + `version-and-tag` jobs. The **`deploy`
job is per-app** — it names your project/SA/WIF and selects the target from the branch. Paste the
block below into `ci-cd.yml` (after `version-and-tag`) and fill the `<…>` placeholders — it is the
one hand-assembly step, so don't change these four load-bearing lines (the **attach contract**):

1. **`needs: version-and-tag`** — chains deploy onto the tag job in the same run.
2. **`if: github.event_name == 'push' && needs.version-and-tag.outputs.tag != ''`** — deploy only
   on push, and only if a tag was actually produced (a failed/blocked gate yields no tag → no
   deploy, no silent success).
3. **`ref: ${{ needs.version-and-tag.outputs.tag }}`** — check out the _tagged_ commit, so the
   build is exactly what was versioned (not whatever `HEAD` drifted to).
4. **the `--substitutions` set** — `TAG_NAME` / `_SERVICE` / `_APP_ENV_NAME` / `_APP_IS_PUBLIC_FACE`
   are what `cloudbuild.yaml` reads; the `Resolve environment from manifest` step reads
   `environments.json` by `github.ref_name` to get the environment **name** and its `isPublicFace`
   facet (the build resolves the rest from the manifest by that name). The **service name** is the
   one per-app bit the manifest does not carry — map it from the environment name here.

```yaml
deploy:
  name: deploy to Cloud Run
  needs: version-and-tag
  if: github.event_name == 'push' && needs.version-and-tag.outputs.tag != ''
  runs-on: ubuntu-latest
  permissions: { contents: read, id-token: write } # id-token for WIF
  env:
    PROJECT_ID: <project>
    REGION: <region>
    WIF_PROVIDER: projects/<project-number>/locations/global/workloadIdentityPools/github-pool/providers/github-provider
    DEPLOY_SA: <deployer-SA>
  steps:
    - uses: actions/checkout@v6
      with: { ref: '${{ needs.version-and-tag.outputs.tag }}', fetch-depth: 0 }
    - name: Resolve environment from manifest
      id: target
      run: |
        # The environment NAME + isPublicFace come from environments.json (the source of truth).
        # The service name is the one per-app bit the manifest doesn't carry — map it here (here:
        # the public-face env deploys to <service>, others to <service>-<name>).
        ENV_NAME="$(node -p "(require('./environments.json').environments.find(e => e.branch === process.env.GITHUB_REF_NAME) || {}).name || ''")"
        IS_PF="$(node -p "String((require('./environments.json').environments.find(e => e.branch === process.env.GITHUB_REF_NAME) || {}).isPublicFace === true)")"
        if [ -z "$ENV_NAME" ]; then echo "Branch is not an environment — should not reach deploy." >&2; exit 1; fi
        if [ "$IS_PF" = "true" ]; then echo "service=<service>" >> "$GITHUB_OUTPUT"
        else echo "service=<service>-${ENV_NAME}" >> "$GITHUB_OUTPUT"; fi
        echo "app_env_name=${ENV_NAME}" >> "$GITHUB_OUTPUT"
        echo "is_public_face=${IS_PF}" >> "$GITHUB_OUTPUT"
    - uses: google-github-actions/auth@v2
      with:
        {
          workload_identity_provider: '${{ env.WIF_PROVIDER }}',
          service_account: '${{ env.DEPLOY_SA }}',
        }
    - uses: google-github-actions/setup-gcloud@v2
    - name: Build & deploy via Cloud Build
      run: |
        TAG="${{ needs.version-and-tag.outputs.tag }}"
        SHORT_SHA="$(git rev-parse --short HEAD)"
        gcloud builds submit \
          --config=cloudbuild.yaml \
          --substitutions="TAG_NAME=${TAG},SHORT_SHA=${SHORT_SHA},_SERVICE=${{ steps.target.outputs.service }},_APP_ENV_NAME=${{ steps.target.outputs.app_env_name }},_APP_IS_PUBLIC_FACE=${{ steps.target.outputs.is_public_face }}" \
          --service-account="projects/${PROJECT_ID}/serviceAccounts/${DEPLOY_SA}" \
          --default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET \
          --project="$PROJECT_ID" --region="$REGION" .
```

`cloudbuild.yaml` (shipped) stamps a UTC build date, builds the `Dockerfile` forwarding
`APP_VERSION` / `APP_ENV_NAME` / `APP_IS_PUBLIC_FACE` / `BUILD_GIT_COMMIT` / `BUILD_DATE` as
build-args (the build resolves the environment's facets from `environments.json` by
`APP_ENV_NAME` and bakes the identity into the frontend bundle AND the compiled server), tags the
image `<service>:<TAG>-<sha>`, pushes to Artifact Registry, and `gcloud run deploy`s with
`--ingress=internal-and-cloud-load-balancing` (locks the service to the LB on every deploy) and
runtime env (`NODE_ENV=production`, `APP_VERSION`, commit/date). The environment identity is
**baked at build time**, not a runtime label — a runtime `APP_ENV` is at most a pass-through of the
same name, never the source of truth. It does **not** grant the `allUsers` invoker — that's the
one-time manual step (`GCP-SETUP.md` §4). Its per-target knobs (`_SERVICE`, `_APP_ENV_NAME`, `_APP_IS_PUBLIC_FACE`)
default to production, so the prod path is byte-identical to a non-staging app.

Non-obvious build flags, each learned the hard way:

- **`--service-account`** — `gcloud builds submit` does **not** auto-run as the calling identity;
  without this it runs as the default compute SA. Set it to `<deployer-SA>`.
- **`--default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET`** — **required** whenever a
  user-managed `--service-account` is set on a regional build, or the submit errors on the logs
  bucket.
- The plain `.` submit builds from the uploaded **working tree**, not the tagged commit — the
  `deploy` job checks out the tag first (`ref: <tag>`), so the tree IS the tagged commit.

### Cloud Build History legibility

Builds from many apps interleave in one project's History. `cloudbuild.yaml`'s `images:` (tagged
`<service>:vX.Y.Z-<shortsha>`) and `tags:` (`app-<service>`, `ref-vX.Y.Z`, `commit-<shortsha>`)
keep them filterable: `gcloud builds list --filter='tags=app-<service>'`. (Tag values can't
contain `/` or `=`; use `key-value` form.) The History **Ref** column stays blank for a plain
local submit; it's populated only by submitting from a **connected repo** with `--revision=vX.Y.Z`
— an opt-in add-on (next section).

---

## Adding a staging environment (per app)

Staging is **a second deploy of the same app, off the `dev` branch, to a second Cloud Run service
on the same load balancer** — production on `<app>.snackbyte.io`, staging on
`<app>.snackbyte.dev`. The branch + the derived `-dev` tag already drive it (no template change);
this is the per-app GCP wiring. One global LB serves **both TLDs** — the cert-map (`GCP-SETUP.md` §5) holds
hostnames across both, host-rules route each. No second LB, no second IP, **~$0 added**.

Per app, in addition to its production wiring:

1. **Cloud Run** — deploy a second service `<service>-staging`. Lock ingress to
   `internal-and-cloud-load-balancing` **and** bind `allUsers run.invoker` (`GCP-SETUP.md` §4 — both, or the LB
   403s). The `deploy` job passes `APP_ENV_NAME=staging` (the build resolves `isPublicFace:false`
   - `noindex:true` from `environments.json` and bakes them — chip shown, no-index); `NODE_ENV`
     stays `production` so the real version is read.
2. **Load balancer** — add a serverless NEG → backend for `<service>-staging`, a host-rule for
   `<app>.snackbyte.dev` on the existing URL map. (The flagship is typically the url-map's
   _default_ service; sibling apps are explicit host-rules.)
3. **TLS** — covered by the `*.snackbyte.dev` wildcard cert-map entry (`GCP-SETUP.md` §5); no per-app cert work.
4. **DNS** — one `A` record `<app>.snackbyte.dev → <LB-IP>` (the same LB IP as prod), TTL 600.
5. **WIF / SA** — reuse the existing pool/provider + `<deployer-SA>`; no new IAM for a public app.

### What the app reports

`/api/version` returns `environment` from the **baked identity** — the environment the image was
built for, decided at build from `environments.json` by `APP_ENV_NAME` and inlined into the compiled
server (and the frontend bundle, so they never disagree). A staging build bakes
`environment: "staging"` with the **real version number** (`NODE_ENV` stays `production`, so the
build's version gate is unaffected). Staging also serves an `X-Robots-Tag: noindex` header (from its
baked `noindex` facet) so it isn't search-indexed; production (facet `noindex:false`) emits no such
header. The **version chip** is shown on staging and hidden on production — driven by the baked
`isPublicFace` facet (production's `true` = public face = chip hidden). App code can branch on the
current environment via the typed `env` accessor (`env.name`, `env.is('staging')`), the same value on
server and frontend.

### Promotion & rollback

- **Promote** staging → prod by fast-forwarding `main` to the `dev` commit (the promotion gate —
  see the Action's `CONSUMING.md`). CI
  reuses the `-dev` number, drops the suffix, deploys prod. The same commit carries both tags; no
  second number is minted.
- **Roll back** either environment without a rebuild: each Cloud Run service keeps its revision
  history. `gcloud run services update-traffic <service|service-staging> --to-revisions=<prev>=100`
  flips back. The `vX.Y.Z[-dev]` tags map a number → its image for finding the revision to pin.

---

## Operational gotchas

- **For a deploy that failed _after_ tagging**, re-run the `deploy` job alone (see Recovery,
  above) — don't re-run the tag job.
- Version-line questions — an unexpected "tag already exists", or `main` running ahead of `dev`
  after a hotfix — are release-flow behavior: see `CONSUMING.md` in
  `jeff-fichtner/snackbyte-release-flow-action`.
- `gcloud` auth expiry, the `google-github-actions` Node deprecation, and other
  infrastructure-side gotchas are in `GCP-SETUP.md` (`project-setup` repo).
