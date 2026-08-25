#!/usr/bin/env bash
set -euo pipefail

# Behavioral lifecycle proof: drives ci-runtime-compose.sh, verify-health.sh,
# and their fail-closed branches through real code paths with mocked docker and
# curl fixtures, asserting concrete observable outcomes: manifest artifacts
# written with exact values, exact docker/curl commands invoked, and refusal of
# stale/refused/wrong web-admin public-base mappings before Playwright begins.

dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
mkdir "$temp/bin"
export RUNNER_TEMP="$temp"
export CI_COMPOSE_PROJECT=plexica-ci-lifecycle-123456
export EVENT_KEY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
export PLUGIN_DB_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export PLUGIN_CREDENTIAL_PEPPER=0123456789abcdef0123456789abcdef
export KEYCLOAK_ADMIN_USER=ci-admin-0123456789abcdef
export KEYCLOAK_ADMIN_PASSWORD=Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export KEYCLOAK_E2E_CLIENT_SECRET=Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export MINIO_ACCESS_KEY=00112233445566778899aabb
export MINIO_SECRET_KEY=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff
export CI_RUNTIME_DIR="$(bash "$dir/ci-runtime-env.sh" init "$CI_COMPOSE_PROJECT")"
runtime=$CI_RUNTIME_DIR
export DOCKER_LOG="$temp/docker.log"
repo_root=$(cd -- "$dir/../../../.." && pwd)
: > "$DOCKER_LOG"
# The workspace is mounted read-only in CI, so stage-browser must ensure the
# host-side single-file mount targets in dist/ exist BEFORE creating the
# containers (runc would otherwise try to create them inside the ro mount);
# the create stub fails closed if a target is missing and records an ordering
# marker otherwise.
cat > "$temp/bin/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "\$DOCKER_LOG"
case "\$*" in
  *' create web-e2e admin-e2e')
    for target in "$repo_root/apps/web/dist/runtime-config.js" "$repo_root/apps/admin/dist/runtime-config.js"; do
      [[ -f "\$target" ]] || { echo "missing host-side mount target \$target" >&2; exit 1; }
    done
    printf '%s\n' mount-targets-present >> "\$DOCKER_LOG" ;;
  *' port postgres 5432'*) printf '127.0.0.1:33001\n' ;;
  *' port redis 6379'*) printf '127.0.0.1:33002\n' ;;
  *' port minio 9000'*) printf '127.0.0.1:33003\n' ;;
  *' port keycloak 8080'*) printf '127.0.0.1:33004\n' ;;
  *' port redpanda 19092'*) printf '127.0.0.1:33005\n' ;;
  *' port core-api-e2e 3001'*) printf '127.0.0.1:33006\n' ;;
  *' port web-e2e 3000'*) printf '127.0.0.1:33007\n' ;;
  *' port admin-e2e 3002'*) printf '127.0.0.1:33008\n' ;;
  *' port loki 3100'*) printf '127.0.0.1:33009\n' ;;
  *' port mailpit 1025'*) printf '127.0.0.1:33010\n' ;;
  *' port mailpit 8025'*) printf '127.0.0.1:33011\n' ;;
  *' ps -q '*) printf 'container\n' ;;
  *inspect*) printf 'running\n' ;;
esac
EOF
cat > "$temp/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CURL_LOG"
if [[ "$*" == *runtime-config.js* ]]; then
  printf 'window.__PLEXICA_RUNTIME_CONFIG__=Object.freeze({apiBase:"",keycloakBase:"http://127.0.0.1:33004"});\n'
fi
EOF
chmod +x "$temp/bin/"*

# Staged writes go through the real compose-discovery code paths.
DOCKER_LOG="$temp/docker.log" PATH="$temp/bin:$PATH" bash "$dir/ci-runtime-compose.sh" write-redpanda
grep -Fx 'REDPANDA_EXTERNAL_LISTENER=127.0.0.1:33005' "$runtime/redpanda-listener.env" >/dev/null
grep -Fx 'KAFKA_BROKERS=127.0.0.1:33005' "$runtime/host.env" >/dev/null
DOCKER_LOG="$temp/docker.log" PATH="$temp/bin:$PATH" bash "$dir/ci-runtime-compose.sh" write-infra
grep -F 'POSTGRES_HOST_URL=postgresql://plexica:changeme@127.0.0.1:33001/plexica' "$runtime/host.env" >/dev/null
grep -Fx 'PLUGIN_DB_SSL_MODE=disable' "$runtime/host.env" >/dev/null
if grep -q '^PLUGIN_DB_SSL_ROOT_CERT_PATH=' "$runtime/host.env"; then
  echo 'Host manifest leaked a container-only plugin DB CA path' >&2; exit 1
fi
grep -F 'KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE=http://keycloak:8080' "$runtime/container.env" >/dev/null
grep -Fx 'KEYCLOAK_PUBLIC_ISSUER_BASE=http://127.0.0.1:33004' "$runtime/browser-endpoints.env" >/dev/null
grep -Fx "MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY" "$runtime/host.env" >/dev/null
grep -Fx "MINIO_SECRET_KEY=$MINIO_SECRET_KEY" "$runtime/container.env" >/dev/null
CI_RUNTIME_DIR="$runtime" CI_RUNTIME_HOST_STAGE=infra bash -c 'source "$0"' "$dir/source-ci-runtime-host.sh" >/dev/null
if CI_RUNTIME_DIR="$runtime" bash -c 'source "$0"' "$dir/source-ci-runtime-host.sh" >/dev/null 2>&1; then
  echo 'Complete host contract was available before Core discovery' >&2; exit 1
fi
DOCKER_LOG="$temp/docker.log" PATH="$temp/bin:$PATH" bash "$dir/ci-runtime-compose.sh" write-core
grep -Fx 'CORE_API_PUBLIC_BASE=http://127.0.0.1:33006' "$runtime/host.env" >/dev/null
# Browser staging contract: runtime-config.js is populated between container
# create and start (bind-mount inode pins at create), then write-browser
# resolves the dynamic ports post-start for the host/browser manifests.
# The dist/ targets are removed first so the create stub proves stage-browser
# recreates them on the writable host side before any container creation.
rm -f "$repo_root/apps/web/dist/runtime-config.js" "$repo_root/apps/admin/dist/runtime-config.js"
DOCKER_LOG="$temp/docker.log" PATH="$temp/bin:$PATH" bash "$dir/ci-runtime-compose.sh" stage-browser
DOCKER_LOG="$temp/docker.log" PATH="$temp/bin:$PATH" bash "$dir/ci-runtime-compose.sh" write-browser
grep -Fx 'WEB_E2E_PUBLIC_BASE=http://127.0.0.1:33007' "$runtime/host.env" >/dev/null
grep -Fx 'ADMIN_E2E_PUBLIC_BASE=http://127.0.0.1:33008' "$runtime/host.env" >/dev/null
grep -F 'keycloakBase:"http://127.0.0.1:33004"' "$runtime/runtime-config.js" >/dev/null
grep -F ' port web-e2e 3000' "$temp/docker.log" >/dev/null
grep -F ' port admin-e2e 3002' "$temp/docker.log" >/dev/null
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
const indexOf = (pattern) => { for (let i = 0; i < lines.length; i++) if (lines[i].endsWith(pattern)) return i; return -1; };
const created = indexOf(" create web-e2e admin-e2e"), started = indexOf(" start web-e2e admin-e2e");
const targets = lines.indexOf("mount-targets-present");
let resolved = -1;
for (let i = 0; i < lines.length; i++) if (lines[i].endsWith(" port web-e2e 3000")) { resolved = i; break; }
if ([created, started, resolved, targets].includes(-1) || !(targets > created && created < started && started < resolved)) process.exit(1);
' "$temp/docker.log"

# Positive readiness gate: every discovered loopback URL is requested.
: > "$temp/curl-positive.log"
CURL_LOG="$temp/curl-positive.log" PATH="$temp/bin:$PATH" bash "$dir/verify-health.sh"
for expected in \
  'http://127.0.0.1:33006/health' \
  'http://127.0.0.1:33006/api/v1/health' \
  'http://127.0.0.1:33007' \
  'http://127.0.0.1:33008' \
  'http://127.0.0.1:33007/runtime-config.js' \
  'http://127.0.0.1:33008/runtime-config.js'; do
  grep -F -- "$expected" "$temp/curl-positive.log" >/dev/null
done

# Refusal: a stale loopback mapping passes contract validation but must fail
# the readiness gate closed instead of reaching Playwright.
bash "$dir/ci-runtime-env.sh" write-host "$runtime" WEB_E2E_PUBLIC_BASE http://127.0.0.1:39999
cat > "$temp/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CURL_LOG"
if [[ "$*" == *127.0.0.1:39999* ]]; then exit 7; fi
if [[ "$*" == *runtime-config.js* ]]; then
  printf 'window.__PLEXICA_RUNTIME_CONFIG__=Object.freeze({apiBase:"",keycloakBase:"http://127.0.0.1:33004"});\n'
fi
EOF
chmod +x "$temp/bin/curl"
: > "$temp/curl-stale.log"
export CI_RUNTIME_HEALTH_TIMEOUT_SECONDS=2 CI_RUNTIME_HEALTH_INTERVAL_SECONDS=1
if CURL_LOG="$temp/curl-stale.log" PATH="$temp/bin:$PATH" bash "$dir/verify-health.sh"; then
  echo 'Readiness gate accepted a stale web public-base mapping' >&2; exit 1
fi
grep -F 'http://127.0.0.1:39999' "$temp/curl-stale.log" >/dev/null

# Refusal: a wrong runtime projection (issuer mismatch) must fail closed.
bash "$dir/ci-runtime-env.sh" write-host "$runtime" WEB_E2E_PUBLIC_BASE http://127.0.0.1:33007
cat > "$temp/bin/curl" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *runtime-config.js* ]]; then
  printf 'window.__PLEXICA_RUNTIME_CONFIG__=Object.freeze({apiBase:"",keycloakBase:"http://127.0.0.1:99999"});\n'
fi
EOF
chmod +x "$temp/bin/curl"
if out=$(CURL_LOG="$temp/curl-wrong.log" PATH="$temp/bin:$PATH" bash "$dir/verify-health.sh" 2>&1); then
  echo 'Readiness gate accepted a wrong runtime-config projection' >&2; exit 1
fi
grep -F 'Runtime config is not the safe manifest projection' <<<"$out" >/dev/null
