#!/usr/bin/env bash
# Provision the runner-scoped E2E PostgreSQL CA material and install the CA
# into the host trust store. Idempotent: existing material is reused, and the
# trust-store step runs only when the installed fingerprint differs.
#
# The contract stack (and the canonical production E2E stack) run postgres
# with TLS; plugin sidecars connect with sslmode=verify-full using a CA bind
# of the HOST system bundle (/etc/ssl/certs/ca-certificates.crt). The runner
# therefore needs a stable E2E CA in that bundle BEFORE any runtime boots.
#
# Usage: provision-e2e-postgres-ca.sh <target-dir>
# Exports on stdout: export lines suitable for `eval`:
#   E2E_POSTGRES_TLS_SOURCE=<target-dir>
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
dir=${1:?Usage: provision-e2e-postgres-ca.sh <target-dir>}
if [[ ! -d $dir ]]; then mkdir -m 700 -p -- "$dir" || fail "Cannot create CA directory $dir"; fi
[[ ! -L "$dir" ]] || fail "CA directory must not be a symlink"

if [[ ! -f $dir/ca.crt || ! -f $dir/ca.key || ! -f $dir/server.crt || ! -f $dir/server.key ]]; then
  openssl req -x509 -newkey rsa:3072 -sha256 -days 90 -nodes \
    -subj '/CN=Plexica E2E PostgreSQL CA' \
    -keyout "$dir/ca.key" -out "$dir/ca.crt" >/dev/null 2>&1
  openssl req -newkey rsa:3072 -sha256 -nodes -subj '/CN=postgres' \
    -keyout "$dir/server.key" -out "$dir/server.csr" >/dev/null 2>&1
  cat > "$dir/server.ext" <<'EOF'
subjectAltName=DNS:postgres,DNS:host.docker.internal,DNS:localhost
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
EOF
  openssl x509 -req -sha256 -days 90 -in "$dir/server.csr" \
    -CA "$dir/ca.crt" -CAkey "$dir/ca.key" -CAcreateserial \
    -extfile "$dir/server.ext" -out "$dir/server.crt" >/dev/null 2>&1
  rm -f "$dir/server.csr"
  chmod 600 "$dir"/*.key; chmod 644 "$dir"/*.crt
fi

fingerprint=$(openssl x509 -in "$dir/ca.crt" -noout -fingerprint -sha256 | cut -d= -f2)
installed_marker="$dir/.trust-installed"
if [[ ${CI_E2E_CA_SKIP_TRUST_STORE:-0} == 1 ]]; then
  printf 'export E2E_POSTGRES_TLS_SOURCE=%q\n' "$dir"
  exit 0
fi
if [[ $(cat "$installed_marker" 2>/dev/null || true) != "$fingerprint" ]]; then
  # The system bundle is runner state by design: plugin sidecars mount it
  # read-only, so a per-run store edit is impossible and a stable CA plus an
  # idempotent install is the only zero-residual-per-run option.
  cp -- "$dir/ca.crt" /usr/local/share/ca-certificates/plexica-e2e-postgres-ca.crt \
    || fail 'Cannot stage the E2E CA into /usr/local/share/ca-certificates'
  update-ca-certificates >/dev/null 2>&1 || fail 'update-ca-certificates failed'
  printf '%s\n' "$fingerprint" > "$installed_marker"
  chmod 600 "$installed_marker"
fi
printf 'export E2E_POSTGRES_TLS_SOURCE=%q\n' "$dir"
