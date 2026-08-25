#!/usr/bin/env bash
set -euo pipefail

# Canonical E2E seeding for one app under the CI runtime contract.
#
# Invokes the app's existing globalSetup logic directly (no bespoke duplicate)
# under the sourced host.env manifest values, then persists the run-scoped
# credentials it emitted into a per-project, per-app manifest that subsequent
# headless Playwright invocations source instead of re-provisioning.
#
# Usage: run-e2e-global-setup.sh <web|admin>
app=${1:?Usage: run-e2e-global-setup.sh <web|admin>}
project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root=$(cd -- "$script_dir/../../../.." && pwd)

[[ "$app" == web || "$app" == admin ]] || { echo "Unknown app $app" >&2; exit 1; }
case "$app" in
  web) filter=web; entry='apps/web/e2e/global-setup.ts' ;;
  admin) filter='@plexica/admin'; entry='apps/admin/e2e/global-setup.ts' ;;
esac

# The manifest is authoritative: host endpoints, project Keycloak credentials,
# and the derived DATABASE_URL/KEYCLOAK_URL/... all come from here so the
# seeding CLIs hit exactly the stack this project bootstrapped.
CI_RUNTIME_HOST_STAGE=complete source "$script_dir/source-ci-runtime-host.sh"
export PLUGIN_SEED_MANIFEST_PATH="$root/e2e/fixtures/crm-production-manifest.json"

# Run-scoped secrets mirror the core-api container's env_file (container.env):
# the seeded plugin catalog and DLQ chaos fixtures must agree with what Core
# encrypts at runtime. Never sourced from a committed dev .env.
while IFS= read -r line; do
  case "$line" in
    EVENT_KEY_ENCRYPTION_KEY=*|PLUGIN_DB_ENCRYPTION_KEY=*|PLUGIN_CREDENTIAL_PEPPER=*) export "$line" ;;
  esac
done < "$runtime/container.env"

# pnpm exec runs inside core-api's package dir, so both runner and entry must
# be absolute paths anchored at the repo root.
cd "$root"
pnpm --filter core-api exec tsx "$root/e2e/ci-bootstrap-setup.ts" "$root/$entry" > "$runtime/setup-raw.env"

manifest="$runtime/setup-$app.env"
temp=$(mktemp "$manifest.XXXXXXX")
# The manifest is the single source the subsequent headless Playwright runs
# source, so it must also carry the host-contract env: several specs import
# core-api modules (kafka/database/config) whose CI_RUNTIME_CONTRACT
# validation hard-requires these loopback endpoints and credentials.
bash "$script_dir/ci-runtime-env.sh" export-host "$runtime" complete > "$temp"
while IFS= read -r line; do
  key=${line%%=*}; value=${line#*=}
  [[ "$key" =~ ^[A-Z0-9_]+$ && -n "$value" ]] || { echo "Invalid setup credential line: $key" >&2; rm -f "$temp" "$runtime/setup-raw.env"; exit 1; }
  printf '%s\n' "$line" >> "$temp"
done < "$runtime/setup-raw.env"
rm -f "$runtime/setup-raw.env"
chmod 600 "$temp"; mv "$temp" "$manifest"
