#!/usr/bin/env bash
# Sourced at the top of every *.test.sh invoked by the CI runtime-contract
# step. The job exports runtime-scoped keys job-wide through GITHUB_ENV
# (ci-runner-admission, encryption-material and infra-credential steps), so a
# contract that merely *reads* its environment would silently assert against
# another run's leaked values. Drop every job-scoped key here; each test then
# re-exports deliberately only what its own fixtures define.
unset NODE_EXTRA_CA_CERTS SSL_CERT_FILE E2E_POSTGRES_TLS_SOURCE \
  CI_COMPOSE_PROJECT CI_RUNTIME_DIR \
  EVENT_KEY_ENCRYPTION_KEY PLUGIN_DB_ENCRYPTION_KEY PLUGIN_CREDENTIAL_PEPPER \
  POSTGRES_PASSWORD MINIO_ACCESS_KEY MINIO_SECRET_KEY
