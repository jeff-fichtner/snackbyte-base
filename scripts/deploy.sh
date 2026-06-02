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
# Requires: gcloud and an authenticated account.
set -euo pipefail

SERVICE="${1:?Usage: ./scripts/deploy.sh <service-name> <gcp-project> [region]}"
PROJECT="${2:?Usage: ./scripts/deploy.sh <service-name> <gcp-project> [region]}"
REGION="${3:-us-central1}"

echo "Deploying '${SERVICE}' to Cloud Run (project=${PROJECT}, region=${REGION})..."

# Build from source (Cloud Build) and deploy.
gcloud run deploy "${SERVICE}" \
  --source . \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --allow-unauthenticated

echo "Done."
