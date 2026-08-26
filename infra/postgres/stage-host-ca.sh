#!/bin/sh
# Stage the E2E Postgres CA onto the Docker host under /run/plexica-ci so the
# sidecar CA bind source (CI_RUNTIME_CA_FILE) resolves on the daemon that
# creates plugin containers. Atomic tmp+mv: concurrent projects sharing one
# runner never observe partial content. Public cert material only — mode 644.
set -eu

readonly OUT=/host-run/plexica-ci
mkdir -p "$OUT"
cp /source/postgres-ca.crt "$OUT/.postgres-ca.crt.tmp"
chmod 644 "$OUT/.postgres-ca.crt.tmp"
mv "$OUT/.postgres-ca.crt.tmp" "$OUT/postgres-ca.crt"
