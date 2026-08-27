#!/bin/sh
# Stage the E2E Postgres CA onto the Docker host under /run/plexica-ci-{project}
# so the sidecar CA bind source (CI_RUNTIME_CA_FILE) resolves on the daemon
# that creates plugin containers. The per-project directory keeps concurrent
# stacks' CA material isolated — a shared path made one stack's sidecars
# verify the other stack's CA (unable to verify the first certificate).
# Atomic tmp+mv: concurrent projects sharing one runner never observe partial
# content. Public cert material only — mode 644.
set -eu

project=${1:?Usage: stage-host-ca.sh <project>}
readonly OUT="/host-run/plexica-ci-${project}"
mkdir -p "$OUT"
cp /source/postgres-ca.crt "$OUT/.postgres-ca.crt.tmp"
chmod 644 "$OUT/.postgres-ca.crt.tmp"
mv "$OUT/.postgres-ca.crt.tmp" "$OUT/postgres-ca.crt"