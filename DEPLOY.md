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
