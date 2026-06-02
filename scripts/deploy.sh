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
# Deploying auto-increments the patch version (and commits it), then bakes the
# version, git commit, and build date into the build. This is the "version advances
# where you ship" model; for multiple environments, opt specific ones out later.
#
# Requires: gcloud, git, and an authenticated account.
set -euo pipefail

SERVICE="${1:?Usage: ./scripts/deploy.sh <service-name> <gcp-project> [region]}"
PROJECT="${2:?Usage: ./scripts/deploy.sh <service-name> <gcp-project> [region]}"
REGION="${3:-us-central1}"

# Auto-increment the patch version and commit it (creates a release commit + tag).
echo "Bumping version..."
npm version patch -m "chore: release v%s" >/dev/null
VERSION="$(node -p "require('./package.json').version")"
COMMIT="$(git rev-parse --short HEAD)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Deploying '${SERVICE}' v${VERSION} (${COMMIT}) to Cloud Run (project=${PROJECT}, region=${REGION})..."

# Build from source (Cloud Build) and deploy. The Dockerfile build stage hardcodes
# CI=true and NODE_ENV=production, so the frontend bundle reads the real version from
# package.json and the chip is hidden in prod. The runtime env feeds the server's
# /api/version (number/commit/date).
gcloud run deploy "${SERVICE}" \
  --source . \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,APP_VERSION=${VERSION},BUILD_GIT_COMMIT=${COMMIT},BUILD_DATE=${BUILD_DATE}"

echo "Done. Deployed v${VERSION} (${COMMIT})."
