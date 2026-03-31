#!/usr/bin/env bash
# verify-env.sh
# Validates that all required environment variables are set.
# Exits 1 if any required variable is missing.
# Usage: source .env && bash infra/scripts/verify-env.sh

set -euo pipefail

REQUIRED_VARS=(
  "POSTGRES_DB"
  "POSTGRES_USER"
  "POSTGRES_PASSWORD"
  "DATABASE_URL"
  "KEYCLOAK_URL"
  "KEYCLOAK_ADMIN_USER"
  "KEYCLOAK_ADMIN_PASSWORD"
  "REDIS_URL"
  "MINIO_ENDPOINT"
  "MINIO_ACCESS_KEY"
  "MINIO_SECRET_KEY"
  "KAFKA_BROKERS"
)

MISSING=()

for VAR in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!VAR:-}" ]]; then
    MISSING+=("$VAR")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: Missing required environment variables:"
  for VAR in "${MISSING[@]}"; do
    echo "  - $VAR"
  done
  echo ""
  echo "Copy .env.example to .env and fill in all values."
  exit 1
fi

echo "All required environment variables are set."
