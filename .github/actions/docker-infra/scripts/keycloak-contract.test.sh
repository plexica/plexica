#!/usr/bin/env bash
set -euo pipefail

compose="$(git rev-parse --show-toplevel)/docker-compose.ci.yml"
grep -F "KC_HOSTNAME_STRICT: 'false'" "$compose" >/dev/null
if grep -E 'KC_HOSTNAME:|KC_PROXY_HEADERS:' "$compose"; then exit 1; fi
if grep -E 'KEYCLOAK_(ADMIN|WEB)_ORIGIN:.*localhost' "$compose"; then exit 1; fi
root=$(git rev-parse --show-toplevel)
if CI_RUNTIME_CONTRACT=1 KEYCLOAK_ADMIN_ORIGIN= bash "$root/infra/keycloak/reconcile-admin-client.sh" >/dev/null 2>&1; then
  echo 'Keycloak reconciliation accepted an absent CI admin mapping' >&2; exit 1
fi
if CI_RUNTIME_CONTRACT=1 KEYCLOAK_WEB_ORIGIN= bash "$root/infra/keycloak/reconcile-tenant-clients.sh" >/dev/null 2>&1; then
  echo 'Keycloak reconciliation accepted an absent CI web mapping' >&2; exit 1
fi
if CI_RUNTIME_CONTRACT=1 KEYCLOAK_ADMIN_ORIGIN=http://localhost:3002 bash "$root/infra/keycloak/reconcile-admin-client.sh" >/dev/null 2>&1; then
  echo 'Keycloak reconciliation accepted a static CI admin mapping' >&2; exit 1
fi
# Under the CI contract the origins are read from their browser-endpoints.env
# manifest keys; static or missing values must still be rejected.
if CI_RUNTIME_CONTRACT=1 ADMIN_E2E_PUBLIC_BASE= bash "$root/infra/keycloak/reconcile-admin-client.sh" >/dev/null 2>&1; then
  echo 'Keycloak reconciliation accepted an absent CI admin origin' >&2; exit 1
fi
if CI_RUNTIME_CONTRACT=1 WEB_E2E_PUBLIC_BASE= bash "$root/infra/keycloak/reconcile-tenant-clients.sh" >/dev/null 2>&1; then
  echo 'Keycloak reconciliation accepted an absent CI web origin' >&2; exit 1
fi
if CI_RUNTIME_CONTRACT=1 ADMIN_E2E_PUBLIC_BASE=http://localhost:3002 bash "$root/infra/keycloak/reconcile-admin-client.sh" >/dev/null 2>&1; then
  echo 'Keycloak reconciliation accepted a non-loopback CI admin origin' >&2; exit 1
fi
if CI_RUNTIME_CONTRACT=1 WEB_E2E_PUBLIC_BASE=http://localhost:3000 bash "$root/infra/keycloak/reconcile-tenant-clients.sh" >/dev/null 2>&1; then
  echo 'Keycloak reconciliation accepted a non-loopback CI web origin' >&2; exit 1
fi
