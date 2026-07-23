#!/usr/bin/env bash
set -euo pipefail

readonly ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [[ "$node_major" != 24 ]]; then
  for candidate in "$HOME"/.nvm/versions/node/v24*/bin; do
    if [[ -x "$candidate/node" ]]; then
      export PATH="$candidate:$PATH"
    fi
  done
fi
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || {
  printf 'Node.js 24 is required for production E2E.\n' >&2
  exit 1
}

readonly RUN_ID=${E2E_RUN_ID:-$(openssl rand -hex 6)}
export COMPOSE_PROJECT_NAME="plexica-e2e-$RUN_ID"
export PLUGIN_RUNTIME_SCOPE="$COMPOSE_PROJECT_NAME"
readonly RUN_DIR="$ROOT/.e2e/runs/$RUN_ID"
mkdir -p "$RUN_DIR"
chmod 700 "$RUN_DIR"

event_key=${EVENT_KEY_ENCRYPTION_KEY:-$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')}
db_key=${PLUGIN_DB_ENCRYPTION_KEY:-$(openssl rand -hex 32)}
pepper=${PLUGIN_CREDENTIAL_PEPPER:-$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')}
cat > "$RUN_DIR/environment" <<EOF
EVENT_KEY_ENCRYPTION_KEY=$event_key
PLUGIN_DB_ENCRYPTION_KEY=$db_key
PLUGIN_CREDENTIAL_PEPPER=$pepper
EOF
chmod 600 "$RUN_DIR/environment"

openssl req -x509 -newkey rsa:3072 -sha256 -days 1 -nodes \
  -subj '/CN=Plexica E2E PostgreSQL CA' \
  -keyout "$RUN_DIR/ca.key" -out "$RUN_DIR/ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:3072 -sha256 -nodes -subj '/CN=postgres' \
  -keyout "$RUN_DIR/server.key" -out "$RUN_DIR/server.csr" >/dev/null 2>&1
cat > "$RUN_DIR/server.ext" <<'EOF'
subjectAltName=DNS:postgres,DNS:host.docker.internal,DNS:localhost
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
EOF
openssl x509 -req -sha256 -days 1 -in "$RUN_DIR/server.csr" \
  -CA "$RUN_DIR/ca.crt" -CAkey "$RUN_DIR/ca.key" -CAcreateserial \
  -extfile "$RUN_DIR/server.ext" -out "$RUN_DIR/server.crt" >/dev/null 2>&1
export E2E_POSTGRES_TLS_SOURCE="$RUN_DIR"

export EVENT_KEY_ENCRYPTION_KEY=$event_key
export PLUGIN_DB_ENCRYPTION_KEY=$db_key
export PLUGIN_CREDENTIAL_PEPPER=$pepper
export NODE_ENV=production
export POSTGRES_PORT=${POSTGRES_PORT:-15432}
export REDIS_PORT=${REDIS_PORT:-16379}
export KEYCLOAK_PORT=${KEYCLOAK_PORT:-18080}
export MINIO_PORT=${MINIO_PORT:-19000}
export MINIO_CONSOLE_PORT=${MINIO_CONSOLE_PORT:-19001}
export REDPANDA_KAFKA_PORT=${REDPANDA_KAFKA_PORT:-29092}
export REDPANDA_ADMIN_PORT=${REDPANDA_ADMIN_PORT:-19644}
export SMTP_PORT=${SMTP_PORT:-11025}
export SMTP_UI_PORT=${SMTP_UI_PORT:-18025}
export LOKI_PORT=${LOKI_PORT:-13100}
export GRAFANA_PORT=${GRAFANA_PORT:-13301}
export DATABASE_URL="postgresql://plexica:changeme@localhost:$POSTGRES_PORT/plexica"
export KEYCLOAK_URL="http://localhost:$KEYCLOAK_PORT"
export KEYCLOAK_ADMIN_USER=admin
export KEYCLOAK_ADMIN_PASSWORD=changeme
export REDIS_URL="redis://localhost:$REDIS_PORT"
export MINIO_ENDPOINT="http://localhost:$MINIO_PORT"
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=changeme
export KAFKA_BROKERS="localhost:$REDPANDA_KAFKA_PORT"
export LOKI_URL="http://localhost:$LOKI_PORT"
export PLUGIN_DB_SSL_MODE=verify-full
export PLUGIN_DB_HOST=postgres
export PLUGIN_DOCKER_NETWORK="${COMPOSE_PROJECT_NAME}_default"
export PLUGIN_CORE_API_URL=http://host.docker.internal:3001
export PLAYWRIGHT_PRODUCTION_MODE=true
export PLUGIN_SEED_MANIFEST_PATH=e2e/fixtures/crm-production-manifest.json
export PLAYWRIGHT_KEYCLOAK_URL="$KEYCLOAK_URL"
export VITE_PLUGIN_ASSET_ORIGIN="$MINIO_ENDPOINT"

readonly COMPOSE=(docker compose -p "$COMPOSE_PROJECT_NAME" -f docker-compose.yml -f docker-compose.ci.yml -f infra/compose/e2e-production.yml)
cleanup() {
  docker ps -aq --filter "label=io.plexica.runtime-scope=$PLUGIN_RUNTIME_SCOPE" | xargs -r docker rm -f
  "${COMPOSE[@]}" down -v --remove-orphans
  rm -rf "$RUN_DIR"
}
trap cleanup EXIT INT TERM

"${COMPOSE[@]}" up -d --wait --wait-timeout 300 postgres keycloak redis minio redpanda mailpit loki
for service in postgres-tls-verify redpanda-init keycloak-init; do
  "${COMPOSE[@]}" up --abort-on-container-exit --exit-code-from "$service" "$service"
done
chmod 644 "$RUN_DIR/ca.crt"
export PLUGIN_DB_SSL_ROOT_CERT_PATH="$RUN_DIR/ca.crt"

pnpm --filter core-api exec prisma migrate deploy
env ROOT="$ROOT" COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  bash scripts/e2e-production-assets.sh

if [[ ${1:-full} == focused ]]; then
  shift || true
  pnpm --filter web exec playwright test \
    e2e/plugin-system e2e/workspace-hierarchy.spec.ts e2e/workspace-tree-a11y.spec.ts "$@"
else
  shift || true
  pnpm --filter web exec playwright test "$@"
fi
