#!/usr/bin/env bash
set -euo pipefail

[[ "${1:-}" == --full-e2e ]] || { echo 'Usage: verify-concurrent-ci-runtime.sh --full-e2e' >&2; exit 1; }
root=$(git rev-parse --show-toplevel)
scripts="$root/.github/actions/docker-infra/scripts"
suffix="${GITHUB_RUN_ID:-local}-${RANDOM}${RANDOM}"
project_a="plexica-ci-a-${suffix}"; project_b="plexica-ci-b-${suffix}"
cleanup() {
  for project in "$project_a" "$project_b"; do
    CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="${RUNNER_TEMP}/plexica-ci/$project" \
      bash "$scripts/down-ci-runtime-project.sh"
  done
}
trap cleanup EXIT

bootstrap() {
  local project="$1" runtime
  runtime="${RUNNER_TEMP}/plexica-ci/$project"
  CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$scripts/verify-ci-runner-capacity.sh" "$project"
  CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" \
    POSTGRES_DB=plexica POSTGRES_USER=plexica POSTGRES_PASSWORD=changeme \
    KEYCLOAK_ADMIN_USER=admin KEYCLOAK_ADMIN_PASSWORD=changeme bash "$scripts/start-services.sh"
  CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" \
    POSTGRES_DB=plexica POSTGRES_USER=plexica POSTGRES_PASSWORD=changeme \
    KEYCLOAK_ADMIN_USER=admin KEYCLOAK_ADMIN_PASSWORD=changeme bash "$scripts/wait-services.sh"
  set -a; source "$runtime/host.env"; set +a
  CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$scripts/ensure-topics.sh"
  pnpm --filter core-api exec node scripts/verify-kafka-roundtrip.mjs "$KAFKA_BROKERS" "$project"
  CI_RUNTIME_CONTRACT=1 CI_RUNTIME_DIR="$runtime" PLAYWRIGHT_E2E=true \
    pnpm --filter web exec playwright test
  CI_RUNTIME_CONTRACT=1 CI_RUNTIME_DIR="$runtime" PLAYWRIGHT_E2E=true \
    pnpm --filter @plexica/admin exec playwright test
}

snapshot() {
  local project="$1" file="$2" service id port
  : > "$file"
  for service in postgres keycloak redpanda core-api-e2e web-e2e admin-e2e; do
    id=$(docker compose --project-name "$project" -f docker-compose.yml -f docker-compose.ci.yml ps -q "$service")
    port=$(docker inspect --format '{{range $p, $v := .NetworkSettings.Ports}}{{range $v}}{{.HostPort}}:{{$p}} {{end}}{{end}}' "$id")
    printf '%s %s %s\n' "$service" "$id" "$port" >> "$file"
  done
}

RUNNER_TEMP="$RUNNER_TEMP" bash "$scripts/ci-runtime-env.sh" init "$project_a" >/dev/null
RUNNER_TEMP="$RUNNER_TEMP" bash "$scripts/ci-runtime-env.sh" init "$project_b" >/dev/null
bootstrap "$project_a" & pid_a=$!
bootstrap "$project_b" & pid_b=$!
wait "$pid_a"; wait "$pid_b"
runtime_b="${RUNNER_TEMP}/plexica-ci/$project_b"
snapshot "$project_b" "$runtime_b/prior-port-sentinel.txt"
CI_COMPOSE_PROJECT="$project_a" CI_RUNTIME_DIR="${RUNNER_TEMP}/plexica-ci/$project_a" bash "$scripts/down-ci-runtime-project.sh"
snapshot "$project_b" "$runtime_b/current-port-sentinel.txt"
cmp "$runtime_b/prior-port-sentinel.txt" "$runtime_b/current-port-sentinel.txt"
set -a; source "$runtime_b/host.env"; set +a
curl --fail --silent --show-error "$CORE_API_PUBLIC_BASE/health" >/dev/null
curl --fail --silent --show-error "$WEB_E2E_PUBLIC_BASE" >/dev/null
curl --fail --silent --show-error "$ADMIN_E2E_PUBLIC_BASE" >/dev/null
CI_COMPOSE_PROJECT="$project_b" CI_RUNTIME_DIR="$runtime_b" bash "$scripts/collect-ci-runtime-diagnostics.sh"
mkdir -p "$CI_RUNTIME_DIR/diagnostics"
cp "$runtime_b/diagnostics/"* "$CI_RUNTIME_DIR/diagnostics/"
