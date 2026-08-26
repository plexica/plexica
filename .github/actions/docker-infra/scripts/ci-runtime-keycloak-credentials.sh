#!/usr/bin/env bash
set -euo pipefail

project=${1:?project is required}
runtime=${2:?runtime is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
validate_ci_runtime "$project" "$runtime"
file="$runtime/keycloak-credentials.env"

valid() {
  [[ ${KEYCLOAK_ADMIN_USER:-} =~ ^ci-admin-[a-f0-9]{16}$ ]] &&
    [[ ${KEYCLOAK_ADMIN_PASSWORD:-} =~ ^[A-Za-z0-9_-]{43}$ ]] &&
    [[ ${KEYCLOAK_E2E_CLIENT_SECRET:-} =~ ^[A-Za-z0-9_-]{43}$ ]]
}

if [[ -e "$file" ]]; then
  [[ -f "$file" && -O "$file" && ! -L "$file" && $(stat -c %a "$file") == 600 ]] || {
    echo 'Unsafe Keycloak credential material' >&2; exit 1;
  }
  source "$file"
  valid || { echo 'Invalid Keycloak credential material' >&2; exit 1; }
  exit 0
fi

hash=$(printf '%s' "$project" | sha256sum | cut -c1-16)
secret() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'; }
KEYCLOAK_ADMIN_USER="ci-admin-$hash"
KEYCLOAK_ADMIN_PASSWORD=$(secret)
KEYCLOAK_E2E_CLIENT_SECRET=$(secret)
valid || { echo 'Could not derive Keycloak credential material' >&2; exit 1; }
umask 077
# Atomic tmp+mv: a crash mid-write must never leave a partial credentials file
# that the idempotent branch above would then reject forever.
temp=$(mktemp "$file.XXXXXX")
printf 'KEYCLOAK_ADMIN_USER=%q\nKEYCLOAK_ADMIN_PASSWORD=%q\nKEYCLOAK_E2E_CLIENT_SECRET=%q\n' \
  "$KEYCLOAK_ADMIN_USER" "$KEYCLOAK_ADMIN_PASSWORD" "$KEYCLOAK_E2E_CLIENT_SECRET" > "$temp"
chmod 600 "$temp"
mv "$temp" "$file"
