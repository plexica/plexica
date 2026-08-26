#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/ci-test-env-guard.sh"

dir=$(cd -- "$(dirname -- "$0")" && pwd)
script="$dir/provision-e2e-postgres-ca.sh"
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
ca_dir="$temp/plexica-ci/e2e-postgres-ca"

# Regression guard for the shared-runner corruption: trust relies exclusively
# on NODE_EXTRA_CA_CERTS / SSL_CERT_FILE, so the system trust store must never
# be touched at all — no sudo, no update-ca-certificates — while the staged CA
# must live inside the runner-owned runtime directory.
if grep -Eq 'sudo|update-ca-certificates' "$script"; then
  echo 'Script must never invoke sudo or update-ca-certificates' >&2; exit 1
fi
grep -F 'postgres-ca.crt' "$script" >/dev/null || { echo 'CA is not staged inside the runtime directory' >&2; exit 1; }

# First run on a fresh runner: generates material, stages postgres-ca.crt and
# exports the three contract keys — succeeding without any root access.
mkdir -m 700 -p "$ca_dir"
eval "$(bash "$script" "$ca_dir")"
[[ $E2E_POSTGRES_TLS_SOURCE == "$ca_dir" ]]
[[ $NODE_EXTRA_CA_CERTS == "$ca_dir/postgres-ca.crt" && $SSL_CERT_FILE == "$ca_dir/postgres-ca.crt" ]]
[[ -f $NODE_EXTRA_CA_CERTS && $(stat -c %a "$NODE_EXTRA_CA_CERTS") == 644 ]]
[[ $(stat -c %a "$ca_dir") == 700 && -f $ca_dir/ca.key && $(stat -c %a "$ca_dir/ca.key") == 600 ]]
staged=$(openssl x509 -in "$NODE_EXTRA_CA_CERTS" -noout -fingerprint -sha256)
generated=$(openssl x509 -in "$ca_dir/ca.crt" -noout -fingerprint -sha256)
[[ $staged == "$generated" ]]

# Idempotent re-run: same material reused, still exports all keys.
cert_inode=$(stat -c %i "$ca_dir/ca.crt")
eval "$(bash "$script" "$ca_dir")"
[[ $NODE_EXTRA_CA_CERTS == "$ca_dir/postgres-ca.crt" && $SSL_CERT_FILE == "$ca_dir/postgres-ca.crt" ]]
[[ $(stat -c %i "$ca_dir/ca.crt") == "$cert_inode" ]]

# Existing-material reuse: pre-created CA content is never regenerated.
echo stale > "$ca_dir/ca.key"
eval "$(bash "$script" "$ca_dir")"
grep -qx stale "$ca_dir/ca.key"
