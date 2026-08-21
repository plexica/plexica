#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
root=$(dirname "$(dirname "$(dirname "$(dirname "$0")")")")
contract="$root/scripts/ci-runtime-env.sh"
compose=(docker compose --project-name "$project" -f docker-compose.yml -f docker-compose.ci.yml)

endpoint() {
  local service="$1" port="$2" value
  value=$("${compose[@]}" port "$service" "$port")
  [[ "$value" =~ ^(127\.0\.0\.1|localhost):[1-9][0-9]*$ ]] || {
    printf 'Invalid %s mapping: %s\n' "$service" "$value" >&2; exit 1;
  }
  printf 'http://%s\n' "$value"
}
write_host() { "$contract" write-host "$runtime" "$1" "$2"; }
write_container() { "$contract" write-container "$runtime" "$1" "$2"; }
write_infra() {
  local postgres redis minio keycloak
  postgres=$(endpoint postgres 5432); redis=$(endpoint redis 6379)
  minio=$(endpoint minio 9000); keycloak=$(endpoint keycloak 8080)
  write_host POSTGRES_HOST_URL "postgresql://${POSTGRES_USER:-plexica}:${POSTGRES_PASSWORD:-changeme}@${postgres#http://}/${POSTGRES_DB:-plexica}"
  write_host REDIS_HOST_URL "redis://${redis#http://}"; write_host MINIO_HOST_URL "$minio"
  write_host KEYCLOAK_HOST_ADMIN_BASE "$keycloak"; write_host KEYCLOAK_PUBLIC_ISSUER_BASE "$keycloak"
  write_container DATABASE_URL "postgresql://${POSTGRES_USER:-plexica}:${POSTGRES_PASSWORD:-changeme}@postgres:5432/${POSTGRES_DB:-plexica}"
  write_container KEYCLOAK_URL http://keycloak:8080; write_container REDIS_URL redis://redis:6379
  write_container MINIO_ENDPOINT http://minio:9000; write_container KAFKA_BROKERS redpanda:9092
  write_container KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE http://keycloak:8080
  write_container KEYCLOAK_ADMIN_USER "${KEYCLOAK_ADMIN_USER:-admin}"
  write_container KEYCLOAK_ADMIN_PASSWORD "${KEYCLOAK_ADMIN_PASSWORD:-changeme}"
  write_container MINIO_ACCESS_KEY "${MINIO_ACCESS_KEY:-minioadmin}"
  write_container MINIO_SECRET_KEY "${MINIO_SECRET_KEY:-changeme}"
  write_container PLUGIN_DB_SSL_MODE disable; write_container PLUGIN_RUNTIME_SCOPE "$project"
  write_container PLUGIN_DOCKER_NETWORK "${project}_default"
}
write_redpanda() {
  local external
  external=$(endpoint redpanda 19092); external=${external#http://}
  printf 'REDPANDA_EXTERNAL_LISTENER=%q\n' "$external" > "$runtime/redpanda-listener.env"
  chmod 600 "$runtime/redpanda-listener.env"
  write_host KAFKA_BROKERS "$external"
}
write_core() { write_host CORE_API_PUBLIC_BASE "$(endpoint core-api-e2e 3001)"; }
write_browser() {
  write_host WEB_E2E_PUBLIC_BASE "$(endpoint web-e2e 3000)"
  write_host ADMIN_E2E_PUBLIC_BASE "$(endpoint admin-e2e 3002)"
  local issuer; issuer=$(grep '^KEYCLOAK_PUBLIC_ISSUER_BASE=' "$runtime/host.env" | cut -d= -f2-)
  "$contract" browser-config "$runtime" "$issuer"
}
case "${1:-}" in
  write-infra) write_infra ;;
  write-redpanda) write_redpanda ;;
  write-core) write_core ;;
  write-browser) write_browser ;;
  *) printf 'Usage: ci-runtime-compose.sh write-infra|write-redpanda|write-core|write-browser\n' >&2; exit 1 ;;
esac
