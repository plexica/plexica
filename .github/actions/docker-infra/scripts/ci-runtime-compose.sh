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
# Dynamic host ports are allocated at container START, not create, so a
# freshly created container has no resolvable mapping yet. Retry bounded
# until compose reports a strict loopback binding.
endpoint_when_allocated() {
  local service="$1" port="$2" value
  local attempts=${CI_RUNTIME_PORT_ATTEMPTS:-30} interval=${CI_RUNTIME_PORT_INTERVAL_SECONDS:-2} attempt
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    value=$("${compose[@]}" port "$service" "$port" 2>/dev/null || true)
    if [[ "$value" =~ ^127\.0\.0\.1:[1-9][0-9]*$ ]]; then
      printf 'http://%s\n' "$value"
      return 0
    fi
    sleep "$interval"
  done
  printf 'Timed out resolving %s dynamic port %s after %s attempts\n' "$service" "$port" "$attempts" >&2
  return 1
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
  : "${MINIO_ACCESS_KEY:?MinIO access key is required}"
  : "${MINIO_SECRET_KEY:?MinIO secret key is required}"
  bash "$contract" write-host-set "$runtime" POSTGRES_HOST_URL "postgresql://${POSTGRES_USER:-plexica}:${POSTGRES_PASSWORD:-changeme}@${postgres#http://}/${POSTGRES_DB:-plexica}" REDIS_HOST_URL "redis://${redis#http://}" MINIO_HOST_URL "$minio" LOKI_HOST_URL "$loki" MAILPIT_SMTP_URL "smtp://${mailpit_smtp#http://}" MAILPIT_UI_BASE "$mailpit_ui" KEYCLOAK_HOST_ADMIN_BASE "$keycloak" KEYCLOAK_PUBLIC_ISSUER_BASE "$keycloak" KEYCLOAK_ADMIN_USER "$KEYCLOAK_ADMIN_USER" KEYCLOAK_ADMIN_PASSWORD "$KEYCLOAK_ADMIN_PASSWORD" KEYCLOAK_E2E_CLIENT_SECRET "$KEYCLOAK_E2E_CLIENT_SECRET" MINIO_ACCESS_KEY "${MINIO_ACCESS_KEY:?MinIO access key is required}" MINIO_SECRET_KEY "${MINIO_SECRET_KEY:?MinIO secret key is required}"
  : "${EVENT_KEY_ENCRYPTION_KEY:?CI runtime event encryption key is required}"
  : "${PLUGIN_DB_ENCRYPTION_KEY:?CI runtime plugin database encryption key is required}"
  : "${PLUGIN_CREDENTIAL_PEPPER:?CI runtime plugin credential pepper is required}"
  bash "$contract" write-container-set "$runtime" DATABASE_URL "postgresql://${POSTGRES_USER:-plexica}:${POSTGRES_PASSWORD:-changeme}@postgres:5432/${POSTGRES_DB:-plexica}" KEYCLOAK_URL http://keycloak:8080 REDIS_URL redis://redis:6379 MINIO_ENDPOINT http://minio:9000 LOKI_URL http://loki:3100 KAFKA_BROKERS redpanda:9092 KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE http://keycloak:8080 KEYCLOAK_ADMIN_USER "$KEYCLOAK_ADMIN_USER" KEYCLOAK_ADMIN_PASSWORD "$KEYCLOAK_ADMIN_PASSWORD" KEYCLOAK_E2E_CLIENT_SECRET "$KEYCLOAK_E2E_CLIENT_SECRET" MINIO_ACCESS_KEY "${MINIO_ACCESS_KEY:?MinIO access key is required}" MINIO_SECRET_KEY "${MINIO_SECRET_KEY:?MinIO secret key is required}" EVENT_KEY_ENCRYPTION_KEY "$EVENT_KEY_ENCRYPTION_KEY" PLUGIN_DB_ENCRYPTION_KEY "$PLUGIN_DB_ENCRYPTION_KEY" PLUGIN_CREDENTIAL_PEPPER "$PLUGIN_CREDENTIAL_PEPPER" PLUGIN_DB_SSL_MODE verify-full PLUGIN_DB_SSL_ROOT_CERT_PATH /etc/ssl/certs/ca-certificates.crt SMTP_HOST mailpit SMTP_PORT 1025 NODE_ENV production PLUGIN_RUNTIME_SCOPE "$scope" PLUGIN_DOCKER_NETWORK "${project}_default"
  # core-api-e2e is created before write-browser, so the issuer must land in
  # browser-endpoints.env at infra time.
  bash "$contract" write-browser-endpoints "$runtime" KEYCLOAK_PUBLIC_ISSUER_BASE "$keycloak"
}
write_redpanda() {
  local external temp
  external=$(endpoint_when_allocated redpanda 19092); external=${external#http://}
  # Single-file bind mounts pin the inode at container creation: an atomic
  # tmp+mv swap would leave the parked redpanda entrypoint reading the stale
  # (empty) inode forever. The staged content is therefore rewritten IN PLACE;
  # the gated entrypoint tolerates transiently incomplete content by parking.
  # Mode 0644: the file carries only a loopback host:port mapping (no
  # credentials), and the sidecar's non-root runtime user must read it.
  temp=$(mktemp "$runtime/redpanda-listener.env.XXXXXX")
  printf 'REDPANDA_EXTERNAL_LISTENER=%q\n' "$external" > "$temp"
  cat -- "$temp" > "$runtime/redpanda-listener.env"
  rm -f "$temp"
  chmod 644 "$runtime/redpanda-listener.env"
  write_host KAFKA_BROKERS "$external"
}
# Redpanda ordering contract: create, then START (Docker allocates the
# published host port at start; the gated entrypoint parks before launching
# the broker process), then resolve the dynamic mapping and write the
# listener env_file it consumes, and only afterwards health-wait it.
stage_redpanda() {
  "${compose[@]}" create redpanda
  "${compose[@]}" start redpanda
  write_redpanda
}
# core-api-e2e is started before this stage, but Compose allocates dynamic
# host ports at START, so resolve with bounded retry instead of a single shot.
write_core() { bash "$contract" write-host-set "$runtime" CORE_API_PUBLIC_BASE "$(endpoint_when_allocated core-api-e2e 3001)"; }
# Browser app staging shares redpanda's create -> populate -> start contract:
# runtime-config.js is bind-mounted read-only into both apps and its inode
# pins at container CREATE, so it must be populated (keycloakBase from infra
# discovery, which always precedes app staging) BETWEEN create and start.
stage_browser() {
  local exports
  # Compose mounts the workspace read-only (.:/workspace:ro), and Docker
  # single-file bind mounts require the host-side target to already exist:
  # when runtime-config.js is absent from the freshly built dist/, runc tries
  # to CREATE it inside the read-only mount and fails with "make mountpoint
  # ... read-only file system". Touching empty targets on the writable host
  # side makes Docker bind-mount OVER them without writing through the ro
  # mount; the populated $runtime source below is what actually gets served.
  mkdir -p "$root/apps/web/dist" "$root/apps/admin/dist"
  : > "$root/apps/web/dist/runtime-config.js"
  : > "$root/apps/admin/dist/runtime-config.js"
  "${compose[@]}" create web-e2e admin-e2e
  exports=$(bash "$contract" export-host "$runtime" infra)
  eval "$exports"
  bash "$contract" browser-config "$runtime" "$KEYCLOAK_PUBLIC_ISSUER_BASE"
  "${compose[@]}" start web-e2e admin-e2e
}
# Post-start manifest extension: the containers are running, so their dynamic
# host ports exist and bounded retry resolves them; keycloak-init starts only
# after this stage, so the origins are in place by then.
write_browser() {
  local web admin
  web=$(endpoint_when_allocated web-e2e 3000); admin=$(endpoint_when_allocated admin-e2e 3002)
  bash "$contract" write-host-set "$runtime" WEB_E2E_PUBLIC_BASE "$web" ADMIN_E2E_PUBLIC_BASE "$admin"
  bash "$contract" write-browser-endpoints "$runtime" WEB_E2E_PUBLIC_BASE "$web" ADMIN_E2E_PUBLIC_BASE "$admin"
}
case "${1:-}" in
  write-infra) write_infra ;;
  write-redpanda) write_redpanda ;;
  stage-redpanda) stage_redpanda ;;
  stage-browser) stage_browser ;;
  write-core) write_core ;;
  write-browser) write_browser ;;
  *) printf 'Usage: ci-runtime-compose.sh write-infra|write-redpanda|stage-redpanda|stage-browser|write-core|write-browser\n' >&2; exit 1 ;;
esac
