#!/usr/bin/env sh
set -eu

export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
positive="host=postgres port=5432 dbname=${POSTGRES_DB} user=${POSTGRES_USER} sslmode=verify-full sslrootcert=/tls/ca.crt"
negative="host=wrong-postgres port=5432 dbname=${POSTGRES_DB} user=${POSTGRES_USER} sslmode=verify-full sslrootcert=/tls/ca.crt connect_timeout=5"

psql "$positive" -v ON_ERROR_STOP=1 -Atc \
  "SELECT CASE WHEN ssl THEN 'verified-tls' ELSE 'plaintext' END FROM pg_stat_ssl WHERE pid = pg_backend_pid()" \
  | grep -qx verified-tls

if psql "$negative" -v ON_ERROR_STOP=1 -Atc 'SELECT 1' >/tmp/negative.out 2>/tmp/negative.err; then
  echo 'verify-full unexpectedly accepted a non-matching hostname' >&2
  exit 1
fi
grep -Eq 'does not match host name|certificate.*wrong-postgres' /tmp/negative.err
echo 'PostgreSQL verify-full positive and hostname-negative checks passed.'
