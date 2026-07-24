#!/usr/bin/env bash
set -euo pipefail

quiet=false
[[ "${1:-}" == "--quiet" ]] && quiet=true
strict=false
[[ "${CI:-}" == "true" ]] && strict=true

env_file="$(dirname "$0")/../../.env"
if ! $strict && [[ -f "$env_file" ]]; then
  # shellcheck disable=SC1090
  source <(grep -E '^(DATABASE_URL|POSTGRES_|REDIS_|KEYCLOAK_|MINIO_|KAFKA_|SMTP_|LOKI_)' \
    "$env_file" | sed 's/^/export /' 2>/dev/null || true)
fi

if $strict; then
  required_env=(
    DATABASE_URL KEYCLOAK_URL KEYCLOAK_ADMIN_USER KEYCLOAK_ADMIN_PASSWORD
    REDIS_URL MINIO_ENDPOINT MINIO_ACCESS_KEY MINIO_SECRET_KEY KAFKA_BROKERS LOKI_URL
  )
  for name in "${required_env[@]}"; do
    if [[ -z "${!name:-}" ]]; then
      printf '[FAIL] CI requires %s.\n' "$name" >&2
      exit 1
    fi
  done
fi

postgres_host="${POSTGRES_HOST:-localhost}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_user="${POSTGRES_USER:-plexica}"
postgres_password="${POSTGRES_PASSWORD:-changeme}"
postgres_db="${POSTGRES_DB:-plexica}"
database_url="${DATABASE_URL:-postgresql://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/${postgres_db}}"
keycloak_url="${KEYCLOAK_URL:-http://localhost:8080}"
minio_endpoint="${MINIO_ENDPOINT:-http://localhost:9000}"
kafka_brokers="${KAFKA_BROKERS:-localhost:19092}"
loki_url="${LOKI_URL:-http://localhost:3100}"
redis_url="${REDIS_URL:-redis://localhost:6379}"
redis_address="${redis_url#*://}"
redis_address="${redis_address##*@}"
redis_host="${redis_address%%:*}"
redis_port="${redis_address##*:}"
kafka_host="${kafka_brokers%%:*}"
kafka_port="${kafka_brokers##*:}"
smtp_host="${SMTP_HOST:-localhost}"
smtp_port="${SMTP_PORT:-1025}"

failed=false
warnings=false

info() {
  $quiet || printf '[CHECK] %s\n' "$1"
}

ok() {
  $quiet || printf '[ OK ] %s\n' "$1"
}

unavailable() {
  local message="$1"
  if $strict; then
    printf '[FAIL] %s\n' "$message" >&2
    failed=true
  else
    printf '[WARN] %s; dependent integration tests may skip locally.\n' "$message" >&2
    warnings=true
  fi
}

check_tcp() {
  nc -z -w3 "$1" "$2" >/dev/null 2>&1
}

check_http() {
  curl -fsS --max-time 5 "$1" >/dev/null 2>&1
}

info "PostgreSQL ${postgres_host}:${postgres_port}"
if check_tcp "$postgres_host" "$postgres_port"; then
  check_script="$(dirname "$0")/check-db-connect.mjs"
  db_result=$(DATABASE_URL="$database_url" node "$check_script" 2>/dev/null || true)
  [[ "$db_result" == "OK" ]] && ok 'PostgreSQL authenticated' \
    || unavailable "PostgreSQL authentication failed (${db_result:-unknown error})"
else
  printf '[FAIL] PostgreSQL is unavailable.\n' >&2
  failed=true
fi

info "Redis ${redis_host}:${redis_port}"
check_tcp "$redis_host" "$redis_port" && ok 'Redis reachable' || unavailable 'Redis unavailable'

info "Keycloak ${keycloak_url}"
check_http "${keycloak_url}/realms/master" && ok 'Keycloak reachable' \
  || unavailable 'Keycloak unavailable'

info "MinIO ${minio_endpoint}"
check_http "${minio_endpoint}/minio/health/live" && ok 'MinIO reachable' \
  || unavailable 'MinIO unavailable'

info "Redpanda ${kafka_host}:${kafka_port}"
check_tcp "$kafka_host" "$kafka_port" && ok 'Redpanda reachable' \
  || unavailable 'Redpanda unavailable'

info "Mailpit ${smtp_host}:${smtp_port}"
check_tcp "$smtp_host" "$smtp_port" && ok 'Mailpit reachable' || unavailable 'Mailpit unavailable'

info "Loki ${loki_url}"
check_http "${loki_url}/ready" && ok 'Loki reachable' || unavailable 'Loki unavailable'

if $failed; then
  printf 'Integration test preflight failed.\n' >&2
  exit 1
fi
if $warnings && ! $quiet; then
  printf 'Required local services passed; optional service warnings remain.\n'
else
  $quiet || printf 'All integration services are reachable.\n'
fi
