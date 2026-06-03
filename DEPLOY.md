# Deploying

This app deploys to **Google Cloud Run**. The intended model:

- **A git tag is the signal to deploy.** CI runs the quality gate (`npm run check:all`)
  on a push to `main`; only if it passes does it increment the version and push a
  `vX.Y.Z` tag. A tag existing therefore means "this passed checks and is deployable."
- **The host watches for tags.** A Cloud Build trigger on the GCP project watches for
  tag pushes, builds the container (the `Dockerfile`), and deploys it to Cloud Run.
  This keeps the deploy host-agnostic: the tag is the single, universal signal, and any
  host that can watch git tags can consume it.
- **Versioning is automatic for revisions, manual for releases.** CI auto-increments
  the patch (each certified build gets a unique, monotonic revision). Bump minor/major
  by hand (`npm version minor`) when a release is meaningful.

## Manual deploy (until the trigger is set up)

You can also deploy directly:

```bash
./scripts/deploy.sh <service-name> <gcp-project> [region]
```

This builds the container via Cloud Build and deploys it to Cloud Run.

## One-time CI setup (per repo)

The release workflow (`.github/workflows/main.yml`) pushes a version-bump commit and a
tag back to `main` on each push. That requires the repo to allow Actions to write:

```bash
gh api -X PUT repos/<owner>/<repo>/actions/permissions/workflow \
  -f default_workflow_permissions=write
```

(Or in the web UI: **Settings → Actions → General → Workflow permissions → "Read and
write permissions" → Save**.)

**Set this _before_ the first push to `main`.** The first push triggers the release
workflow, which tags on success — if write permission isn't enabled yet, the gate passes
but the tag step fails with a 403. (If that happens: enable the setting, then re-run the
failed job or push again.) The CLI command needs a token with admin rights on the repo.

## One-time GCP setup (per app)

To get an app onto GCP the first time, you (or an agent) set up, once:

- A **GCP project** (apps can share one project as separate Cloud Run services).
- **APIs**: Cloud Run, Cloud Build, Artifact Registry.
- A **Cloud Build trigger** watching this repo's tags → build + deploy on tag push.
- A **domain mapping** for the app's subdomain.

> This is documented intent, not a finished runbook — the tag-triggered CI/versioning
> workflow isn't wired up yet. When it is, this file becomes the concrete setup guide.
> At scale (many apps), this one-time setup is a candidate to codify in Terraform.
