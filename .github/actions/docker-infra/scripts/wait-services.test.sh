#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/ci-test-env-guard.sh"

dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
mkdir "$temp/bin"; export RUNNER_TEMP="$temp"
export CI_COMPOSE_PROJECT=plexica-ci-wait-123456
export EVENT_KEY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
export PLUGIN_DB_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export PLUGIN_CREDENTIAL_PEPPER=0123456789abcdef0123456789abcdef
export MINIO_ACCESS_KEY=00112233445566778899aabb
export MINIO_SECRET_KEY=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff
export CI_RUNTIME_DIR="$(bash "$dir/ci-runtime-env.sh" init "$CI_COMPOSE_PROJECT")"
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
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
# Marker into the docker sequence log so the test can prove sidecar image
# publication completes BEFORE the plugin proxy and Core containers exist.
printf '%s\n' "lifecycle-publish-done $*" >> "${DOCKER_LOG:-/dev/null}"
EOF
chmod +x "$temp/bin/"*
# No listener contract is pre-written here: wait-services.sh itself must
# create redpanda, inspect its mapping, write the contract, and only then
# start and health-wait it (asserted by the docker mock's ordering gate).
if CI_RUNTIME_DIR="$CI_RUNTIME_DIR" bash -c 'source "$0"' "$dir/source-ci-runtime-host.sh"; then
  echo 'Complete host contract was available before Core and browser inspection' >&2; exit 1
fi
PATH="$temp/bin:$PATH" COMMAND_LOG="$temp/commands" DOCKER_LOG="$temp/docker-commands" bash "$dir/wait-services.sh"
CI_RUNTIME_DIR="$CI_RUNTIME_DIR" bash -c 'source "$0"' "$dir/source-ci-runtime-host.sh"
grep -Fx -- '--publish-only' "$temp/commands.lifecycle" >/dev/null
# Sidecar publication ordering proof: BOTH digest-pinned sidecar images
# (harness + CRM plugin) must be published before plugin-docker-proxy and
# core-api-e2e are created, since both services consume sidecar-images.env.
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
const publishDone = lines.findIndex((line) => line.startsWith("lifecycle-publish-done"));
const proxyCreated = lines.findIndex((line) => line.endsWith(" create plugin-docker-proxy"));
const coreCreated = lines.findIndex((line) => line.endsWith(" create core-api-e2e"));
if ([publishDone, proxyCreated, coreCreated].includes(-1)) process.exit(1);
if (!(publishDone < proxyCreated && publishDone < coreCreated)) process.exit(1);
' "$temp/docker-commands"
# Redpanda ordering proof: the dynamic port may only be resolved AFTER the
# container was created and started, and the health wait comes last.
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
const indexOf = (pattern) => { for (let i = 0; i < lines.length; i++) if (lines[i].endsWith(pattern)) return i; return -1; };
let resolved = -1, waited = -1;
for (let i = 0; i < lines.length; i++) {
  if (resolved < 0 && lines[i].endsWith(" port redpanda 19092")) resolved = i;
  if (waited < 0 && lines[i].includes(" up ") && lines[i].includes("--wait") && lines[i].endsWith(" redpanda")) waited = i;
}
const created = indexOf(" create redpanda"), started = indexOf(" start redpanda");
if ([created, started, resolved, waited].includes(-1) || !(created < started && started < resolved && resolved < waited)) process.exit(1);
' "$temp/docker-commands"
# App-services ordering proof: web-e2e/admin-e2e/core-api-e2e dynamic ports
# may only be resolved AFTER their containers were created AND started;
# resolving on a created-but-not-started container fails ("is not running").
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
const indexOf = (pattern) => { for (let i = 0; i < lines.length; i++) if (lines[i].endsWith(pattern)) return i; return -1; };
const firstIndexOf = (pattern) => { for (let i = 0; i < lines.length; i++) if (lines[i].endsWith(pattern)) return i; return -1; };
for (const [created, started, port] of [
  [" create web-e2e admin-e2e", " start web-e2e admin-e2e", " port web-e2e 3000"],
  [" create web-e2e admin-e2e", " start web-e2e admin-e2e", " port admin-e2e 3002"],
  [" create core-api-e2e", " start core-api-e2e", " port core-api-e2e 3001"],
]) {
  const c = indexOf(created), s = indexOf(started), r = firstIndexOf(port);
  if ([c, s, r].includes(-1) || !(c < s && s < r)) process.exit(1);
}
' "$temp/docker-commands"
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
printf '%s\n' "$*" >> "$DOCKER_LOG"
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
if PATH="$temp/bin:$PATH" COMMAND_LOG="$temp/commands-refused" CURL_LOG="$temp/curls-refused" DOCKER_LOG="$temp/docker-commands-refused" bash "$dir/wait-services.sh"; then
  echo 'Readiness gate accepted a stale web public-base mapping' >&2; exit 1
fi
# The refusal path must still honor the redpanda start-before-resolve order.
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
const indexOf = (pattern) => { for (let i = 0; i < lines.length; i++) if (lines[i].endsWith(pattern)) return i; return -1; };
const created = indexOf(" create redpanda"), started = indexOf(" start redpanda");
let resolved = -1;
for (let i = 0; i < lines.length; i++) if (lines[i].endsWith(" port redpanda 19092")) { resolved = i; break; }
if ([created, started, resolved].includes(-1) || !(created < started && started < resolved)) process.exit(1);
' "$temp/docker-commands-refused"
# The refusal path must also honor the app-services start-before-resolve order.
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
const indexOf = (pattern) => { for (let i = 0; i < lines.length; i++) if (lines[i].endsWith(pattern)) return i; return -1; };
const created = indexOf(" create web-e2e admin-e2e"), started = indexOf(" start web-e2e admin-e2e");
let resolved = -1;
for (let i = 0; i < lines.length; i++) if (lines[i].endsWith(" port web-e2e 3000")) { resolved = i; break; }
if ([created, started, resolved].includes(-1) || !(created < started && started < resolved)) process.exit(1);
' "$temp/docker-commands-refused"
grep -F 'WEB_E2E_PUBLIC_BASE=http://127.0.0.1:39999' "$CI_RUNTIME_DIR/host.env" >/dev/null
grep -F 'http://127.0.0.1:39999' "$temp/curls-refused" >/dev/null
if grep -qi 'playwright' "$temp/commands-refused" >/dev/null; then
  echo 'Readiness gate reached Playwright despite a refused mapping' >&2; exit 1
fi
