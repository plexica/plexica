#!/usr/bin/env bash
# Provision the runner-scoped E2E PostgreSQL CA material and export host-process
# trust environment for it. Idempotent: existing material is reused.
#
# The contract stack (and the canonical production E2E stack) run postgres
# with TLS; plugin sidecars connect with sslmode=verify-full using a CA bind
# of the HOST system bundle (/etc/ssl/certs/ca-certificates.crt). Host-side
# consumers (Node: playwright/global-setup; OpenSSL: prisma) trust the CA via
# NODE_EXTRA_CA_CERTS / SSL_CERT_FILE pointing INSIDE the runner-owned runtime
# directory. The system trust store is never touched: sidecars bind the host
# bundle live, so mutating it mid-flight would corrupt concurrent runs, and
# GitHub-hosted runners have no root access anyway.
#
# Usage: provision-e2e-postgres-ca.sh <target-dir>
# Exports on stdout: export lines suitable for `eval`:
#   E2E_POSTGRES_TLS_SOURCE=<target-dir>
#   NODE_EXTRA_CA_CERTS=<target-dir>/postgres-ca.crt
#   SSL_CERT_FILE=<target-dir>/postgres-ca.crt
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

# Host-process trust staging: the CA lives inside the runner-owned (0700)
# runtime directory and is exported via trust env below. Never a system path.
cp -- "$dir/ca.crt" "$dir/postgres-ca.crt"
chmod 644 "$dir/postgres-ca.crt"

printf 'export E2E_POSTGRES_TLS_SOURCE=%q\n' "$dir"
printf 'export NODE_EXTRA_CA_CERTS=%q\nexport SSL_CERT_FILE=%q\n' \
  "$dir/postgres-ca.crt" "$dir/postgres-ca.crt"
