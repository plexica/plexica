#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
export CI_RUNTIME_SCOPE="$(bash "$script_dir/ci-runtime-scope.sh" "$project")"
root=$(cd -- "$script_dir/../../../.." && pwd)
contract="$script_dir/ci-runtime-env.sh"
compose=(docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml")
validate_ci_runtime "$project" "$runtime"

endpoint() {
  local service="$1" port="$2" value
  value=$("${compose[@]}" port "$service" "$port")
  [[ "$value" =~ ^127\.0\.0\.1:[1-9][0-9]*$ ]] || {
    printf 'Invalid %s mapping %s: only a strict 127.0.0.1:<port> loopback is accepted, localhost is rejected\n' "$service" "$value" >&2; exit 1;
  }
  printf 'http://%s\n' "$value"
}
write_host() { bash "$contract" write-host "$runtime" "$1" "$2"; }
write_container() { bash "$contract" write-container "$runtime" "$1" "$2"; }
write_infra() {
  local postgres redis minio keycloak loki mailpit_smtp mailpit_ui scope
  postgres=$(endpoint postgres 5432); redis=$(endpoint redis 6379)
  minio=$(endpoint minio 9000); keycloak=$(endpoint keycloak 8080); loki=$(endpoint loki 3100)
  mailpit_smtp=$(endpoint mailpit 1025); mailpit_ui=$(endpoint mailpit 8025)
  scope=$(bash "$script_dir/ci-runtime-scope.sh" "$project")
  : "${KEYCLOAK_ADMIN_USER:?Project Keycloak admin user is required}"
  : "${KEYCLOAK_ADMIN_PASSWORD:?Project Keycloak admin password is required}"
  : "${KEYCLOAK_E2E_CLIENT_SECRET:?Project Keycloak client secret is required}"
  bash "$contract" write-host-set "$runtime" POSTGRES_HOST_URL "postgresql://${POSTGRES_USER:-plexica}:${POSTGRES_PASSWORD:-changeme}@${postgres#http://}/${POSTGRES_DB:-plexica}" REDIS_HOST_URL "redis://${redis#http://}" MINIO_HOST_URL "$minio" LOKI_HOST_URL "$loki" MAILPIT_SMTP_URL "smtp://${mailpit_smtp#http://}" MAILPIT_UI_BASE "$mailpit_ui" KEYCLOAK_HOST_ADMIN_BASE "$keycloak" KEYCLOAK_PUBLIC_ISSUER_BASE "$keycloak" KEYCLOAK_ADMIN_USER "$KEYCLOAK_ADMIN_USER" KEYCLOAK_ADMIN_PASSWORD "$KEYCLOAK_ADMIN_PASSWORD" KEYCLOAK_E2E_CLIENT_SECRET "$KEYCLOAK_E2E_CLIENT_SECRET"
  : "${EVENT_KEY_ENCRYPTION_KEY:?CI runtime event encryption key is required}"
  : "${PLUGIN_DB_ENCRYPTION_KEY:?CI runtime plugin database encryption key is required}"
  : "${PLUGIN_CREDENTIAL_PEPPER:?CI runtime plugin credential pepper is required}"
  bash "$contract" write-container-set "$runtime" DATABASE_URL "postgresql://${POSTGRES_USER:-plexica}:${POSTGRES_PASSWORD:-changeme}@postgres:5432/${POSTGRES_DB:-plexica}" KEYCLOAK_URL http://keycloak:8080 REDIS_URL redis://redis:6379 MINIO_ENDPOINT http://minio:9000 LOKI_URL http://loki:3100 KAFKA_BROKERS redpanda:9092 KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE http://keycloak:8080 KEYCLOAK_ADMIN_USER "$KEYCLOAK_ADMIN_USER" KEYCLOAK_ADMIN_PASSWORD "$KEYCLOAK_ADMIN_PASSWORD" KEYCLOAK_E2E_CLIENT_SECRET "$KEYCLOAK_E2E_CLIENT_SECRET" MINIO_ACCESS_KEY "${MINIO_ACCESS_KEY:-minioadmin}" MINIO_SECRET_KEY "${MINIO_SECRET_KEY:-changeme}" EVENT_KEY_ENCRYPTION_KEY "$EVENT_KEY_ENCRYPTION_KEY" PLUGIN_DB_ENCRYPTION_KEY "$PLUGIN_DB_ENCRYPTION_KEY" PLUGIN_CREDENTIAL_PEPPER "$PLUGIN_CREDENTIAL_PEPPER" PLUGIN_DB_SSL_MODE verify-full PLUGIN_DB_SSL_ROOT_CERT_PATH /etc/ssl/certs/ca-certificates.crt SMTP_HOST mailpit SMTP_PORT 1025 NODE_ENV production PLUGIN_RUNTIME_SCOPE "$scope" PLUGIN_DOCKER_NETWORK "${project}_default"
  # core-api-e2e is created before write-browser, so the issuer must land in
  # browser-endpoints.env at infra time.
  bash "$contract" write-browser-endpoints "$runtime" KEYCLOAK_PUBLIC_ISSUER_BASE "$keycloak"
}
write_redpanda() {
  local external temp
  external=$(endpoint redpanda 19092); external=${external#http://}
  # Atomic tmp+mv: the env_file is bind-mounted read-only into redpanda, so
  # readers must never observe a truncated or half-written listener file.
  temp=$(mktemp "$runtime/redpanda-listener.env.XXXXXX")
  printf 'REDPANDA_EXTERNAL_LISTENER=%q\n' "$external" > "$temp"
  chmod 600 "$temp"; mv "$temp" "$runtime/redpanda-listener.env"
  write_host KAFKA_BROKERS "$external"
}
write_core() { bash "$contract" write-host-set "$runtime" CORE_API_PUBLIC_BASE "$(endpoint core-api-e2e 3001)"; }
write_browser() {
  local web admin exports
  web=$(endpoint web-e2e 3000); admin=$(endpoint admin-e2e 3002)
  bash "$contract" write-host-set "$runtime" WEB_E2E_PUBLIC_BASE "$web" ADMIN_E2E_PUBLIC_BASE "$admin"
  # keycloak-init is started only after this stage, so the origins are in place.
  bash "$contract" write-browser-endpoints "$runtime" WEB_E2E_PUBLIC_BASE "$web" ADMIN_E2E_PUBLIC_BASE "$admin"
  exports=$(bash "$contract" export-host "$runtime" infra)
  eval "$exports"
  bash "$contract" browser-config "$runtime" "$KEYCLOAK_PUBLIC_ISSUER_BASE"
}
case "${1:-}" in
  write-infra) write_infra ;;
  write-redpanda) write_redpanda ;;
  write-core) write_core ;;
  write-browser) write_browser ;;
  *) printf 'Usage: ci-runtime-compose.sh write-infra|write-redpanda|write-core|write-browser\n' >&2; exit 1 ;;
esac
