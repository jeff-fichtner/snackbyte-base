# Deploying

This app deploys to **Google Cloud Run**, fronted by a **global external HTTPS load
balancer**. Apps can share one GCP project (each its own Cloud Run service + subdomain on
the shared LB). The GCP/infra model below is **as-built and proven** — it's what actually
works end to end, distilled from standing up the first apps in the project.

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

## One-time GCP setup (per app)

In dependency order. Most of this is one-time _per project_ and reused by every app; the
genuinely per-app bits are flagged.

### 1. APIs

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com compute.googleapis.com \
  iamcredentials.googleapis.com secretmanager.googleapis.com \
  certificatemanager.googleapis.com \
  cloudresourcemanager.googleapis.com --project=<project>
```

(Run + Cloud Build + Artifact Registry for the build/deploy. Compute for the load balancer.
IAM Credentials for WIF. Certificate Manager for the cert-map TLS model. Secret Manager +
Resource Manager for the optional connected-repo link / any 2nd-gen Cloud Build resources.)

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

### 4. Cloud Run service — ingress AND invoker (both required)

Two independent controls, and a service is only reachable-through-the-LB-and-only-the-LB when
**both** are set. They are applied differently:

- **Ingress — automated, every deploy.** `cloudbuild.yaml` passes
  `--ingress=internal-and-cloud-load-balancing` on every `gcloud run deploy`, so the service
  rejects direct `*.run.app` traffic and the LB is the only front door — including on the very
  first deploy. **Consequence:** the `run.app` URL returns **404 by design** — always test through
  the LB / your hostname. (Nothing to do here; it's in the pipeline.)
- **Invoker — a ONE-TIME manual grant you must not forget on a NEW service.** Bind `allUsers` to
  `roles/run.invoker`. This is an IAM posture decision granted once at stand-up, **not** done by
  the deploy pipeline. **Until you run it, a brand-new service's host returns a Google-frontend
  `403`** through the LB (an HTML 403 from Google's infra, not your app) even though the deploy
  succeeded and the cert is ACTIVE — that 403 is the signature of the missing invoker.

```bash
# Run ONCE per new service, right after its first deploy:
gcloud run services add-iam-policy-binding <service> \
  --member=allUsers --role=roles/run.invoker --project=<project> --region=<region>
```

> **First-deploy checklist for a new service.** The pipeline locks ingress for you, but the first
> deploy of a new app (or a new `-staging` service) lands **half-wired** until you grant the
> invoker. If the host 403s through the LB right after a green deploy: run the grant above. (Ingress
> is the lockdown; the invoker is the grant — a public site needs both. The ingress lock is about
> _path_, not _authz_.)

### 5. Load balancer + TLS (one-time per project, shared by all apps)

Cloud Run's built-in domain mapping **can't serve an apex domain** and **isn't GA in every
region** (e.g. `us-central1`), so it's the wrong tool. Stand up a **global external HTTPS load
balancer** once; every app rides it on a different hostname.

Resources (one set per project): a global static IP (`<LB-IP>`, the DNS target), a serverless
NEG → backend service → URL map → HTTPS proxy + forwarding rule (:443), plus an HTTP forwarding
rule (:80) that 301-redirects to HTTPS.

**TLS is a Certificate Manager cert-MAP, not a classic SSL cert.** When a cert map is attached to
the HTTPS proxy it takes precedence, so adding a SAN to a classic cert is a **no-op**. A second
TLD needs its **own** per-domain DNS authorization, a managed cert, and cert-map entries — you
cannot reuse another domain's authorization. Use a **wildcard** so future subdomain apps need no
cert work:

```bash
# Per TLD, once: a wildcard-capable DNS authorization (PER_PROJECT_RECORD, not FIXED_RECORD),
# a managed cert covering the apex + wildcard, and cert-map entries pointing at it.
gcloud certificate-manager dns-authorizations create <tld>-dnsauth \
  --domain="<tld>" --type=PER_PROJECT_RECORD --project=<project>
gcloud certificate-manager certificates create <tld>-cert \
  --domains="<tld>,*.<tld>" --dns-authorizations=<tld>-dnsauth --project=<project>
gcloud certificate-manager maps entries create <tld>-apex \
  --map=<cert-map> --certificates=<tld>-cert --hostname="<tld>" --project=<project>
gcloud certificate-manager maps entries create <tld>-wild \
  --map=<cert-map> --certificates=<tld>-cert --hostname="*.<tld>" --project=<project>
```

The wildcard pre-solves TLS for the whole TLD — a future `<app>.<tld>` then needs only its own
Cloud Run service + NEG + backend + url-map host-rule + one DNS `A` record, **no cert work**.
(Caveat: `*.<tld>` is single-label — covers `app.<tld>` but not `x.app.<tld>`.)

**DNS is registrar-gated and partly manual.** If the TLD is hosted at an external registrar
(GoDaddy, etc.) and Cloud DNS is not enabled, gcloud **cannot** create the records — an operator
must add them by hand. Two records per domain:

1. `CNAME _acme-challenge[...] → <id>.authorize.certificatemanager.goog` — emitted by the
   dns-authorization; the managed cert won't go `ACTIVE` until it resolves.
2. `A @ → <LB-IP>` (apex), `CNAME www → @` (mirrors the apex). **Leave MX records alone**
   (Workspace email).

> **If the GoDaddy domain is in this workspace and the `godaddy` CLI is on your PATH, an agent can
> add these records directly instead of doing it by hand** (it wraps the GoDaddy DNS API). It is a
> workspace tool, not part of this template, so it won't exist everywhere — when it's present, prefer
> it; when it isn't, add the records manually as above. `delete` refuses to run non-interactively, so
> it's safe to hand to an agent. Read first, then write:
>
> ```bash
> # args are positional: <domain> <type> <name> <value>
> godaddy dns list <domain>                                 # see current records
> godaddy dns add  <domain> CNAME _acme-challenge <id>.authorize.certificatemanager.goog
> godaddy dns set  <domain> A @ <LB-IP> --ttl 600           # replace the apex A
> ```
>
> (`add` appends, `set` replaces a type+name. Creds load from `~/.config/godaddy-cli/.env`. Source +
> README live at `~/Snackbyte/tools/godaddy-cli`; run `godaddy dns --help` for the current surface.)

Set a low **TTL (600)** on records you'll later flip (a cutover then propagates in ~10 min). A
managed cert goes `ACTIVE` only after DNS validates (~15–60 min). A static public IP is expected —
security is at the LB edge (managed TLS, HTTPS-only, baseline DDoS), not from hiding the IP.

**Cost reality:** the LB forwarding rule is a flat **~$18/mo baseline per load balancer**,
regardless of traffic. Because one LB fronts every app and both TLDs, the 2nd…Nth app adds
**~$0**.

---

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
one-time manual step (§4). Its per-target knobs (`_SERVICE`, `_APP_ENV_NAME`, `_APP_IS_PUBLIC_FACE`)
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

## Connected-repo link (Ref column) — opt-in

**Skip it unless you want the History Ref column.** A 2nd-gen Cloud Build **repo connection** lets
you submit `--revision=vX.Y.Z` from the connected repo so History's **Ref** column shows the tag.
It is **only** a build _source_ — **not** a trigger, and it does **not** depend on webhook
delivery. The default local submit deploys identically without it. To use it, swap the final `.`
in the build command for the connected-repo resource and add `--revision=<tag>`.

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

## Adding a staging environment (per app)

Staging is **a second deploy of the same app, off the `dev` branch, to a second Cloud Run service
on the same load balancer** — production on `<app>.snackbyte.io`, staging on
`<app>.snackbyte.dev`. The branch + the derived `-dev` tag already drive it (no template change);
this is the per-app GCP wiring. One global LB serves **both TLDs** — the cert-map (§5) holds
hostnames across both, host-rules route each. No second LB, no second IP, **~$0 added**.

Per app, in addition to its production wiring:

1. **Cloud Run** — deploy a second service `<service>-staging`. Lock ingress to
   `internal-and-cloud-load-balancing` **and** bind `allUsers run.invoker` (§4 — both, or the LB
   403s). The `deploy` job passes `APP_ENV_NAME=staging` (the build resolves `isPublicFace:false`
   - `noindex:true` from `environments.json` and bakes them — chip shown, no-index); `NODE_ENV`
     stays `production` so the real version is read.
2. **Load balancer** — add a serverless NEG → backend for `<service>-staging`, a host-rule for
   `<app>.snackbyte.dev` on the existing URL map. (The flagship is typically the url-map's
   _default_ service; sibling apps are explicit host-rules.)
3. **TLS** — covered by the `*.snackbyte.dev` wildcard cert-map entry (§5); no per-app cert work.
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

## Adding another app to the same project (the fleet pattern)

The project hosts many apps; each is its own repo → Cloud Run service → subdomain on the shared LB.
Per new app `<app>`:

1. **WIF binding** — reuse the existing pool/provider (the owner condition already allows all your
   repos); add one `roles/iam.workloadIdentityUser` binding for `…/attribute.repository/<owner>/<app>`
   on its deploy SA.
2. **Cloud Run** — deploys as a separate service; lock ingress **and** bind `allUsers run.invoker`
   (§4).
3. **Artifact Registry** — images namespaced by service automatically.
4. **Load balancer** — add a serverless NEG + backend + host-rule on the existing URL map; add one
   `A` record for the sub → same `<LB-IP>`. TLS is already covered by the wildcard cert (§5). **No
   new LB, no new IP, no cert work, ~$0 added.**
5. **Workflow** — wire the release flow per `CONSUMING.md` as usual, then add the per-app `deploy`
   job (above), changing `_SERVICE`, the WIF principal, and the host.

---

## Operational gotchas

- **For a deploy that failed _after_ tagging**, re-run the `deploy` job alone (see Recovery,
  above) — don't re-run the tag job. (Version-line questions — an unexpected "tag already
  exists", or `main` running ahead of `dev` after a hotfix — are release-flow behavior and are
  explained in the Action's `CONSUMING.md`.)
- **`gcloud` auth expiry** — tokens expire ~hourly; re-auth with `gcloud auth login <account>`.
  Pass the right `--account` for the project (a machine may own several Google identities — the
  wrong one silently targets the wrong project).
- **`google-github-actions/*` (in the per-app deploy job) run on Node 20** — every CI run annotates
  the deprecation, and GitHub **forces Node 24 on 2026-06-16**. Bump `auth@` / `setup-gcloud@` to a
  Node 24 major before then (check their releases for the current tag).
