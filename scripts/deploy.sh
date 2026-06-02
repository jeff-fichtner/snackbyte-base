#!/usr/bin/env bash
# Builds the container image and deploys it to Cloud Run.
#
# Usage:
#   ./scripts/deploy.sh <service-name> [region]
#
# Requires: gcloud, an authenticated account, and a target GCP project set
# (gcloud config set project <id>).
set -euo pipefail

SERVICE="${1:?Usage: ./scripts/deploy.sh <service-name> [region]}"
REGION="${2:-us-central1}"

echo "Deploying '${SERVICE}' to Cloud Run (${REGION})..."

# Build from source (Cloud Build) and deploy.
gcloud run deploy "${SERVICE}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated

echo "Done."
