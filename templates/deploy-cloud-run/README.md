# deploy-cloud-run

A deploy template: how an app built into one container image deploys to Google Cloud Run. It is
one of the templates the snackbyte-base hub composes an app from; it places two files at the app's
root and nothing else:

- `cloudbuild.yaml` — the Cloud Build config: refuses to build without every required value, builds
  the app's root `Dockerfile` with the environment and version as build arguments, pushes the image,
  and deploys it to Cloud Run by digest.
- `DEPLOY.md` — the app's half of deploying: the per-app `deploy` job, the build arguments, staging,
  promotion and rollback.

It does not depend on what the app is built with. It relies on the image contract every app's root
`Dockerfile` meets: built from the app root; takes `APP_ENV_NAME`, `APP_VERSION`,
`BUILD_GIT_COMMIT` and `BUILD_DATE` as build arguments; listens on `PORT`; runs as a non-root user.

The one-time hosting it deploys onto (the project, Workload Identity Federation, the load balancer)
is set up from `GCP-SETUP.md` in the `project-setup` repo, not here.

## Working on the template

```bash
npm ci
npm run check:all   # format check + the Cloud Build tests
```

`tests/cloudbuild.test.ts` runs the build steps' scripts the way Cloud Build would, with `docker`
and `gcloud` replaced by stubs. The tests stay here; an app receives only the two files above.
