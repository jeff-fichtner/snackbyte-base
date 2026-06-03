#!/usr/bin/env bash
# Builds the container image and deploys it to Cloud Run.
#
# Usage:
#   ./scripts/deploy.sh <service-name> <gcp-project> [region]
#
# The GCP project is REQUIRED and passed explicitly — the script never relies on
# whatever project gcloud happens to have active, so it can't accidentally deploy
# into the wrong (e.g. a client's) project.
#
# Versioning is owned by CI (the GitHub Action on main bumps the version and tags).
# This script just builds and deploys whatever version is currently in package.json,
# passing the version, git commit, and build date as RUNTIME env vars (which feed the
# server's /api/version). It does NOT forward them into the Docker build stage.
#
# Requires: gcloud, git, and an authenticated account.
set -euo pipefail

SERVICE="${1:?Usage: ./scripts/deploy.sh <service-name> <gcp-project> [region]}"
PROJECT="${2:?Usage: ./scripts/deploy.sh <service-name> <gcp-project> [region]}"
REGION="${3:-us-central1}"

VERSION="$(node -p "require('./package.json').version")"
COMMIT="$(git rev-parse --short HEAD)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Deploying '${SERVICE}' v${VERSION} (${COMMIT}) to Cloud Run (project=${PROJECT}, region=${REGION})..."

# Build from source (Cloud Build) and deploy. The Dockerfile build stage hardcodes
# CI=true and NODE_ENV=production, so the frontend bundle reads the real version from
# package.json and the chip is hidden in prod. The runtime env (--set-env-vars below)
# feeds the server's /api/version (number/commit/date).
#
# Note: the frontend bundle's commit/date would come from the Dockerfile's build ARGs,
# but '--source .' does not currently forward BUILD_GIT_COMMIT/BUILD_DATE as
# --build-arg, so those ARGs fall back to their 'unknown' defaults at build time.
# Only the server's /api/version (from the runtime env vars) reflects the real values.
gcloud run deploy "${SERVICE}" \
  --source . \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,APP_VERSION=${VERSION},BUILD_GIT_COMMIT=${COMMIT},BUILD_DATE=${BUILD_DATE}"

echo "Done. Deployed v${VERSION} (${COMMIT})."
