#!/usr/bin/env bash
set -euo pipefail

# Per-run encryption/credential material for the CI runtime contract. Never
# a committed default (Security §5 — secrets only via environment): every
# value is generated fresh per job invocation with openssl and printed as
# KEY=value lines for the caller to append to $GITHUB_ENV. Shared between
# ci-runtime-contract (base set only — verify-concurrent-ci-runtime.sh
# generates its own per-project Postgres/MinIO credentials internally) and
# ci (base set plus --full for its single Postgres/MinIO instance), so the
# two jobs do not duplicate this logic (Rule 4 line-budget relief for
# ci.yml).
key() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'; }
printf 'EVENT_KEY_ENCRYPTION_KEY=%s\nPLUGIN_DB_ENCRYPTION_KEY=%s\nPLUGIN_CREDENTIAL_PEPPER=%s\n' \
  "$(key)" "$(openssl rand -hex 32)" "$(key)"
[[ "${1:-}" == --full ]] || exit 0
printf 'POSTGRES_PASSWORD=%s\nMINIO_ACCESS_KEY=%s\nMINIO_SECRET_KEY=%s\n' \
  "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" "$(openssl rand -hex 32)"
