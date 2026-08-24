#!/usr/bin/env bash
set -euo pipefail

[[ "${1:-}" == --full-e2e ]] || { echo 'Usage: verify-concurrent-ci-runtime.sh --full-e2e' >&2; exit 1; }
root=$(git rev-parse --show-toplevel)
scripts=${CI_RUNTIME_SCRIPTS_DIR:-"$root/.github/actions/docker-infra/scripts"}
# Port-sentinel snapshot and isolation gates live in a sourced helper to keep
# this orchestrator under the 200-line constitution cap.
source "$scripts/verify-concurrent-port-gates.sh"
output=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
suffix="${GITHUB_RUN_ID:-local}-${RANDOM}${RANDOM}"
project_a="plexica-ci-a-${suffix}"; project_b="plexica-ci-b-${suffix}"
initialized=(); torn_down=(); diagnostics_collected=0
compose() {
  local project="$1" runtime="${RUNNER_TEMP}/plexica-ci/$1"
  CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" \
    CI_RUNTIME_SCOPE="$(bash "$scripts/ci-runtime-scope.sh" "$project")" \
    docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml" "${@:2}"
}
# Teardown is exactly-once per project: the down script deletes the runtime
# dir, and a second down against it fails closed (realpath validation), which
# would make every successful run exit 1 via the EXIT trap. Projects torn
# down explicitly are recorded here and skipped by cleanup(); a failed down
# is NOT recorded, so cleanup still retries partial teardowns.
down() {
  local project
  for project in "${torn_down[@]}"; do [[ "$project" != "$1" ]] || return 0; done
  CI_COMPOSE_PROJECT="$1" CI_RUNTIME_DIR="${RUNNER_TEMP}/plexica-ci/$1" bash "$scripts/down-ci-runtime-project.sh" || return $?
  torn_down+=("$1")
}
collect() {
  local failed=0 project runtime target
  mkdir -p "$output/diagnostics"
  for project in "${initialized[@]}"; do
    runtime="${RUNNER_TEMP}/plexica-ci/$project"
    CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$scripts/collect-ci-runtime-diagnostics.sh" || failed=1
    target="$output/diagnostics/$project"; mkdir -p "$target"
    cp -R "$runtime/diagnostics/." "$target/" || failed=1
  done
  return "$failed"
}
cleanup_done=0
cleanup() {
  local status=$? diagnostics=0 teardown=0
  if (( cleanup_done )); then return 0; fi
  cleanup_done=1
  trap - EXIT; set +e
  (( diagnostics_collected )) || collect || diagnostics=1
  for project in "${initialized[@]}"; do down "$project" || teardown=1; done
  (( status == 0 && diagnostics == 0 && teardown == 0 )) || exit 1
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

# Concurrent A/B bootstraps share one working tree, so every Playwright
# invocation must write into a per-project output root under its own runtime
# dir (cleaned up with the project teardown). Otherwise identical test titles
# clear and cross artifacts in the shared default test-results/ and
# playwright-report/ directories.
run_playwright() {
  local project="$1" filter="$2" suite="$3" name out
  local runtime="${RUNNER_TEMP}/plexica-ci/$project" args=()
  name=${filter##*/}
  out="$runtime/playwright/$name"
  mkdir -p "$out/test-results" "$out/report"
  [[ -z "$suite" ]] || args=("$suite")
  # Full-suite invocations must skip the contract specs: bootstrap already ran
  # them once per app pre-teardown via the explicit invocation above.
  if [[ -z "$suite" ]]; then
    CI_RUNTIME_CONTRACT=1 CI_RUNTIME_DIR="$runtime" PLAYWRIGHT_E2E=true \
      PLAYWRIGHT_HTML_REPORT="$out/report" CI_RUNTIME_SKIP_CONTRACT_SPEC=1 \
      pnpm --filter "$filter" exec playwright test --output "$out/test-results"
  else
    CI_RUNTIME_CONTRACT=1 CI_RUNTIME_DIR="$runtime" PLAYWRIGHT_E2E=true \
      PLAYWRIGHT_HTML_REPORT="$out/report" \
      pnpm --filter "$filter" exec playwright test --output "$out/test-results" "${args[@]}"
  fi
}

bootstrap() {
  local project="$1" runtime="${RUNNER_TEMP}/plexica-ci/$1" postgres_password
  # Per-run generated secret (never a committed default): both lifecycle
  # invocations for this project receive the SAME value so the Postgres
  # container init, Keycloak DB attach, and host/container.env manifests agree.
  postgres_password=$(openssl rand -hex 24)
  CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$scripts/verify-ci-runner-capacity.sh" "$project"
  CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" POSTGRES_DB=plexica POSTGRES_USER=plexica POSTGRES_PASSWORD="$postgres_password" \
    bash "$scripts/start-services.sh"
  CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" POSTGRES_DB=plexica POSTGRES_USER=plexica POSTGRES_PASSWORD="$postgres_password" \
    bash "$scripts/wait-services.sh"
  export CI_RUNTIME_DIR="$runtime"; source "$scripts/source-ci-runtime-host.sh"
  CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$scripts/ensure-topics.sh"
  pnpm --filter core-api exec node scripts/verify-kafka-roundtrip.mjs "$KAFKA_BROKERS" "$project"
  run_playwright "$project" web e2e/ci-runtime-contract.spec.ts
  run_playwright "$project" @plexica/admin e2e/ci-runtime-contract.spec.ts
  run_playwright "$project" web ''
  run_playwright "$project" @plexica/admin ''
}

assert_keycloak_project_isolation() {
  local runtime_a="$1" runtime_b="$2" user_a password_a user_b password_b endpoint_b probe status body
  CI_RUNTIME_DIR="$runtime_a" source "$scripts/source-ci-runtime-host.sh"
  user_a=$KEYCLOAK_ADMIN_USER; password_a=$KEYCLOAK_ADMIN_PASSWORD
  CI_RUNTIME_DIR="$runtime_b" source "$scripts/source-ci-runtime-host.sh"
  user_b=$KEYCLOAK_ADMIN_USER; password_b=$KEYCLOAK_ADMIN_PASSWORD; endpoint_b=$KEYCLOAK_HOST_ADMIN_BASE
  [[ "$user_a:$password_a" != "$user_b:$password_b" ]] || {
    echo 'Concurrent projects share Keycloak credentials' >&2; exit 1;
  }
  # Isolation is only proven by a real Keycloak rejection response. A curl
  # transport failure (DNS, refused, timeout) proves nothing and must fail
  # the run instead of silently counting as isolation evidence.
  probe=$(curl --silent --show-error --write-out '\n%{http_code}' -X POST \
    "$endpoint_b/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password&client_id=admin-cli&username=$user_a&password=$password_a") || {
    echo 'Cross-project Keycloak probe failed at transport level' >&2; exit 1;
  }
  status=${probe##*$'\n'}; body=${probe%$'\n'*}
  [[ -n "$body" && ( "$status" == 400 || "$status" == 401 ) ]] || {
    echo "Project B accepted project A Keycloak credentials (HTTP $status)" >&2; exit 1;
  }
}

verify_project() {
  local project="$1" runtime="${RUNNER_TEMP}/plexica-ci/$1" discovery token
  export CI_RUNTIME_DIR="$runtime"; source "$scripts/source-ci-runtime-host.sh"
  curl --fail --silent --show-error "$CORE_API_PUBLIC_BASE/health" >/dev/null
  discovery=$(curl --fail --silent --show-error "$KEYCLOAK_HOST_ADMIN_BASE/realms/master/.well-known/openid-configuration")
  [[ -n "${KEYCLOAK_ADMIN_USER:-}" && -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]] || {
    echo 'KEYCLOAK_ADMIN_USER or KEYCLOAK_ADMIN_PASSWORD is unset or empty' >&2; exit 1;
  }
  token=$(curl --fail --silent --show-error -X POST "$KEYCLOAK_HOST_ADMIN_BASE/realms/master/protocol/openid-connect/token" -d 'grant_type=password&client_id=admin-cli' --data-urlencode "username=$KEYCLOAK_ADMIN_USER" --data-urlencode "password=$KEYCLOAK_ADMIN_PASSWORD")
  node "$scripts/verify-ci-keycloak-issuer.mjs" "$KEYCLOAK_PUBLIC_ISSUER_BASE" "$discovery" "$token"
  pnpm --filter core-api exec node scripts/verify-kafka-roundtrip.mjs "$KAFKA_BROKERS" "$project"
  # Contract specs run exactly once per project per lifecycle phase:
  # bootstrap already ran them pre-teardown; this post-teardown phase must
  # not repeat them.
  run_playwright "$project" web e2e/ci-runtime-contract.spec.ts
  run_playwright "$project" @plexica/admin e2e/ci-runtime-contract.spec.ts
}

assert_absent() {
  local project="$1"
  [[ -z $(docker ps -aq --filter "label=com.docker.compose.project=$project") ]] || { echo 'Teardown retained containers' >&2; exit 1; }
  [[ -z $(docker network ls -q --filter "label=com.docker.compose.project=$project") ]] || { echo 'Teardown retained networks' >&2; exit 1; }
  [[ -z $(docker volume ls -q --filter "label=com.docker.compose.project=$project") ]] || { echo 'Teardown retained volumes' >&2; exit 1; }
}

RUNNER_TEMP="$RUNNER_TEMP" bash "$scripts/ci-runtime-env.sh" init "$project_a" >/dev/null; initialized+=("$project_a")
RUNNER_TEMP="$RUNNER_TEMP" bash "$scripts/ci-runtime-env.sh" init "$project_b" >/dev/null; initialized+=("$project_b")
assert_no_legacy_fixed_ports
bootstrap "$project_a" & pid_a=$!; bootstrap "$project_b" & pid_b=$!
failed_projects=()
wait "$pid_a" || failed_projects+=("$project_a")
wait "$pid_b" || failed_projects+=("$project_b")
if (( ${#failed_projects[@]} )); then
  exit 1
fi
runtime_a="${RUNNER_TEMP}/plexica-ci/$project_a"; runtime_b="${RUNNER_TEMP}/plexica-ci/$project_b"
assert_keycloak_project_isolation "$runtime_a" "$runtime_b"
snapshot "$project_a" "$runtime_a/prior-port-sentinel.txt"
snapshot "$project_b" "$runtime_b/prior-port-sentinel.txt"
mkdir -p "$output"
{ printf 'A\n'; cat "$runtime_a/prior-port-sentinel.txt"; printf 'B\n'; cat "$runtime_b/prior-port-sentinel.txt"; } > "$output/a-b-port-sentinel.txt"
assert_disjoint_ports "$runtime_a/prior-port-sentinel.txt" "$runtime_b/prior-port-sentinel.txt"
assert_manifest_does_not_reuse_ports "$runtime_a/prior-port-sentinel.txt" "$runtime_b/host.env"
cp "$runtime_b/host.env" "$runtime_b/prior-host.env"; cp "$runtime_b/container.env" "$runtime_b/prior-container.env"
cp "$runtime_b/runtime-config.js" "$runtime_b/prior-runtime-config.js"
collect; diagnostics_collected=1
down "$project_a"; assert_absent "$project_a"
snapshot "$project_b" "$runtime_b/current-port-sentinel.txt"
cmp "$runtime_b/prior-port-sentinel.txt" "$runtime_b/current-port-sentinel.txt"
cmp "$runtime_b/prior-host.env" "$runtime_b/host.env"; cmp "$runtime_b/prior-container.env" "$runtime_b/container.env"
cmp "$runtime_b/prior-runtime-config.js" "$runtime_b/runtime-config.js"
verify_project "$project_b"
