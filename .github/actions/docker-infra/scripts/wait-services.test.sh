#!/usr/bin/env bash
set -euo pipefail

dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
mkdir "$temp/bin"; export RUNNER_TEMP="$temp"
export CI_COMPOSE_PROJECT=plexica-ci-wait-123456
export EVENT_KEY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
export PLUGIN_DB_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export PLUGIN_CREDENTIAL_PEPPER=0123456789abcdef0123456789abcdef
export CI_RUNTIME_DIR="$(bash "$dir/ci-runtime-env.sh" init "$CI_COMPOSE_PROJECT")"
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *' port postgres 5432'*) printf '127.0.0.1:32001\n' ;;
  *' port redis 6379'*) printf '127.0.0.1:32002\n' ;;
  *' port minio 9000'*) printf '127.0.0.1:32003\n' ;;
  *' port keycloak 8080'*) printf '127.0.0.1:32004\n' ;;
  *' port redpanda 19092'*) printf '127.0.0.1:32005\n' ;;
  *' port core-api-e2e 3001'*) printf '127.0.0.1:32006\n' ;;
  *' port web-e2e 3000'*) printf '127.0.0.1:32007\n' ;;
  *' port admin-e2e 3002'*) printf '127.0.0.1:32008\n' ;;
  *' port loki 3100'*) printf '127.0.0.1:32009\n' ;;
  *' port mailpit 1025'*) printf '127.0.0.1:32010\n' ;;
  *' port mailpit 8025'*) printf '127.0.0.1:32011\n' ;;
  # Ordering gate: any health wait that includes redpanda must observe an
  # already-written listener contract, or Redpanda's gated entrypoint would
  # block until the wait timeout expires in real runs.
  *' up '*--wait*)
    if [[ "$*" == *' redpanda'* ]]; then
      grep -qx 'REDPANDA_EXTERNAL_LISTENER=127.0.0.1:32005' "$CI_RUNTIME_DIR/redpanda-listener.env" || {
        echo 'redpanda waited for health before its listener contract was written' >&2
        exit 1
      }
    fi ;;
  *' ps -q '*) printf 'container\n' ;;
  'wait '*|*' wait '*) printf '0\n' ;;
  *'inspect'*) printf 'running\n' ;;
esac
EOF
cat > "$temp/bin/pnpm" <<'EOF'
#!/usr/bin/env bash
printf '%s|%s|%s|%s|%s\n' "$DATABASE_URL" "$KEYCLOAK_URL" "$REDIS_URL" "$MINIO_ENDPOINT" "$KAFKA_BROKERS" >> "$COMMAND_LOG"
EOF
cat > "$temp/bin/curl" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *runtime-config.js ]]; then printf 'window.__PLEXICA_RUNTIME_CONFIG__=Object.freeze({apiBase:"",keycloakBase:"http://127.0.0.1:32004"});\n'; fi
EOF
cat > "$temp/bin/verify-ci-sidecar-lifecycle.sh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$COMMAND_LOG.lifecycle"
[[ "$*" == *'--publish-only'* ]]
EOF
chmod +x "$temp/bin/"*
# No listener contract is pre-written here: wait-services.sh itself must
# create redpanda, inspect its mapping, write the contract, and only then
# start and health-wait it (asserted by the docker mock's ordering gate).
if CI_RUNTIME_DIR="$CI_RUNTIME_DIR" bash -c 'source "$0"' "$dir/source-ci-runtime-host.sh"; then
  echo 'Complete host contract was available before Core and browser inspection' >&2; exit 1
fi
PATH="$temp/bin:$PATH" COMMAND_LOG="$temp/commands" bash "$dir/wait-services.sh"
CI_RUNTIME_DIR="$CI_RUNTIME_DIR" bash -c 'source "$0"' "$dir/source-ci-runtime-host.sh"
grep -Fx -- '--publish-only' "$temp/commands.lifecycle" >/dev/null
node -e '
const lines=require("node:fs").readFileSync(process.argv[1],"utf8").trim().split("\n");
const expected="postgresql://plexica:changeme@127.0.0.1:32001/plexica|http://127.0.0.1:32004|redis://127.0.0.1:32002|http://127.0.0.1:32003|127.0.0.1:32005";
if (lines.length !== 2 || !lines.every((line) => line === expected)) process.exit(1);
' "$temp/commands"

# Readiness-refusal regression: Compose discovery reporting a stale web-e2e
# mapping passes contract validation but must fail the readiness gate closed
# before Playwright begins.
cat > "$temp/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CURL_LOG"
if [[ "$*" == *127.0.0.1:39999* ]]; then exit 7; fi
if [[ "$*" == *runtime-config.js ]]; then printf 'window.__PLEXICA_RUNTIME_CONFIG__=Object.freeze({apiBase:"",keycloakBase:"http://127.0.0.1:32004"});\n'; fi
EOF
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *' port web-e2e 3000'*) printf '127.0.0.1:39999\n' ;;
  *' port postgres 5432'*) printf '127.0.0.1:32001\n' ;;
  *' port redis 6379'*) printf '127.0.0.1:32002\n' ;;
  *' port minio 9000'*) printf '127.0.0.1:32003\n' ;;
  *' port keycloak 8080'*) printf '127.0.0.1:32004\n' ;;
  *' port redpanda 19092'*) printf '127.0.0.1:32005\n' ;;
  *' port core-api-e2e 3001'*) printf '127.0.0.1:32006\n' ;;
  *' port admin-e2e 3002'*) printf '127.0.0.1:32008\n' ;;
  *' port loki 3100'*) printf '127.0.0.1:32009\n' ;;
  *' port mailpit 1025'*) printf '127.0.0.1:32010\n' ;;
  *' port mailpit 8025'*) printf '127.0.0.1:32011\n' ;;
  *' up '*--wait*)
    if [[ "$*" == *' redpanda'* ]]; then
      grep -qx 'REDPANDA_EXTERNAL_LISTENER=127.0.0.1:32005' "$CI_RUNTIME_DIR/redpanda-listener.env" || {
        echo 'redpanda waited for health before its listener contract was written' >&2
        exit 1
      }
    fi ;;
  *' ps -q '*) printf 'container\n' ;;
  'wait '*|*' wait '*) printf '0\n' ;;
  *'inspect'*) printf 'running\n' ;;
esac
EOF
chmod +x "$temp/bin/curl" "$temp/bin/docker"
: > "$temp/commands-refused"; : > "$temp/curls-refused"
export CI_RUNTIME_HEALTH_TIMEOUT_SECONDS=2 CI_RUNTIME_HEALTH_INTERVAL_SECONDS=1
if PATH="$temp/bin:$PATH" COMMAND_LOG="$temp/commands-refused" CURL_LOG="$temp/curls-refused" bash "$dir/wait-services.sh"; then
  echo 'Readiness gate accepted a stale web public-base mapping' >&2; exit 1
fi
grep -F 'WEB_E2E_PUBLIC_BASE=http://127.0.0.1:39999' "$CI_RUNTIME_DIR/host.env" >/dev/null
grep -F 'http://127.0.0.1:39999' "$temp/curls-refused" >/dev/null
if grep -qi 'playwright' "$temp/commands-refused" >/dev/null; then
  echo 'Readiness gate reached Playwright despite a refused mapping' >&2; exit 1
fi
