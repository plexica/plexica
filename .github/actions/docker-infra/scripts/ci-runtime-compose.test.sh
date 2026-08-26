#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/ci-test-env-guard.sh"

temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
export RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT=plexica-ci-compose-123456
export EVENT_KEY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
export PLUGIN_DB_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export PLUGIN_CREDENTIAL_PEPPER=0123456789abcdef0123456789abcdef
export MINIO_ACCESS_KEY=00112233445566778899aabb
export MINIO_SECRET_KEY=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff
export CI_RUNTIME_DIR="$(bash "$(dirname "$0")/ci-runtime-env.sh" init "$CI_COMPOSE_PROJECT")"
mkdir "$temp/bin"
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
  *) exit 1 ;;
esac
EOF
chmod +x "$temp/bin/docker"
script="$(cd -- "$(dirname -- "$0")" && pwd)/ci-runtime-compose.sh"
repo_root=$(cd -- "$(dirname -- "$script")/../../../.." && pwd)
bash "$(dirname "$0")/ci-runtime-keycloak-credentials.sh" "$CI_COMPOSE_PROJECT" "$CI_RUNTIME_DIR"
set -a; source "$CI_RUNTIME_DIR/keycloak-credentials.env"; set +a
PATH="$temp/bin:$PATH" bash "$script" write-redpanda
PATH="$temp/bin:$PATH" bash "$script" write-infra
PATH="$temp/bin:$PATH" bash "$script" write-core
PATH="$temp/bin:$PATH" bash "$script" write-browser
scope="ci-$(printf '%s' "$CI_COMPOSE_PROJECT" | sha256sum | cut -c1-28)"
[[ "$(bash "$(dirname "$0")/ci-runtime-scope.sh" "$CI_COMPOSE_PROJECT")" == "$scope" ]]
grep -Fx 'CORE_API_PUBLIC_BASE=http://127.0.0.1:32006' "$CI_RUNTIME_DIR/host.env" >/dev/null
grep -Fx "PLUGIN_RUNTIME_SCOPE=$scope" "$CI_RUNTIME_DIR/container.env" >/dev/null
grep -Fx 'KAFKA_BROKERS=redpanda:9092' "$CI_RUNTIME_DIR/container.env" >/dev/null && grep -Fx 'CI_RUNTIME_CONTRACT_CONTAINER=1' "$CI_RUNTIME_DIR/container.env" >/dev/null
grep -Fx 'MAILPIT_UI_BASE=http://127.0.0.1:32011' "$CI_RUNTIME_DIR/host.env" >/dev/null
grep -Fx 'MAILPIT_SMTP_URL=smtp://127.0.0.1:32010' "$CI_RUNTIME_DIR/host.env" >/dev/null
grep -Fx 'SMTP_HOST=mailpit' "$CI_RUNTIME_DIR/container.env" >/dev/null
grep -Fx 'LOKI_URL=http://loki:3100' "$CI_RUNTIME_DIR/container.env" >/dev/null
grep -Fx 'NODE_ENV=production' "$CI_RUNTIME_DIR/container.env" >/dev/null
# Presigned plugin-asset URLs must target the browser-reachable loopback
# mapping while storage ops keep the container-internal endpoint.
grep -Fx 'MINIO_ENDPOINT=http://minio:9000' "$CI_RUNTIME_DIR/container.env" >/dev/null
grep -Fx 'MINIO_PUBLIC_ENDPOINT=http://127.0.0.1:32003' "$CI_RUNTIME_DIR/container.env" >/dev/null
# Canonical E2E rate-limit tuning must reach the contract Core container: the
# host-run suite raises RATE_LIMIT_MAX/ADMIN_RATE_LIMIT_MAX via coreApiEnv,
# and rate-limit.spec requires XFF isolation through a trusted proxy hop.
grep -Fx 'RATE_LIMIT_MAX=10000' "$CI_RUNTIME_DIR/container.env" >/dev/null
grep -Fx 'ADMIN_RATE_LIMIT_MAX=10000' "$CI_RUNTIME_DIR/container.env" >/dev/null
grep -Fx 'RATE_LIMIT_RESOLVE_MAX=30' "$CI_RUNTIME_DIR/container.env" >/dev/null
grep -Fx 'TRUST_PROXY=127.0.0.1,::1,::ffff:127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16' "$CI_RUNTIME_DIR/container.env" >/dev/null
if grep -Eq 'LOKI_HOST_URL|MAILPIT_(SMTP_URL|UI_BASE)|KEYCLOAK_HOST_ADMIN_BASE' "$CI_RUNTIME_DIR/container.env"; then
  echo 'Container contract exposed runner-only endpoints' >&2; exit 1
fi
grep -Fx "EVENT_KEY_ENCRYPTION_KEY=$EVENT_KEY_ENCRYPTION_KEY" "$CI_RUNTIME_DIR/container.env" >/dev/null
grep -Fx 'WEB_E2E_PUBLIC_BASE=http://127.0.0.1:32007' "$CI_RUNTIME_DIR/browser-endpoints.env" >/dev/null
grep -Fx 'ADMIN_E2E_PUBLIC_BASE=http://127.0.0.1:32008' "$CI_RUNTIME_DIR/browser-endpoints.env" >/dev/null
grep -Fx 'KEYCLOAK_PUBLIC_ISSUER_BASE=http://127.0.0.1:32004' "$CI_RUNTIME_DIR/browser-endpoints.env" >/dev/null
[[ $(stat -c %a "$CI_RUNTIME_DIR/browser-endpoints.env") == 600 ]]
grep -Fx 'REDPANDA_EXTERNAL_LISTENER=127.0.0.1:32005' "$CI_RUNTIME_DIR/redpanda-listener.env" >/dev/null
# Helper resolution must not depend on the invoking working directory: the
# contract helper is resolved from the script's own location (BASH_SOURCE),
# so write-infra succeeds from anywhere (regression: it once resolved a
# nonexistent .github/scripts/ci-runtime-env.sh when launched from elsewhere).
for cwd in / /tmp "$PWD"; do
  ( cd -- "$cwd" && PATH="$temp/bin:$PATH" bash "$script" write-infra )
done
grep -Fx 'POSTGRES_HOST_URL=postgresql://plexica:changeme@127.0.0.1:32001/plexica' "$CI_RUNTIME_DIR/host.env" >/dev/null
grep -Fx 'PLUGIN_DB_SSL_MODE=disable' "$CI_RUNTIME_DIR/host.env" >/dev/null && ! grep -q '^PLUGIN_DB_SSL_ROOT_CERT_PATH=' "$CI_RUNTIME_DIR/host.env" # dev/test host CLIs: TLS disabled, no container-only CA path
# MinIO credentials must reach BOTH manifests fail-closed; no insecure default may appear.
for manifest in host container; do
  grep -Fx "MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY" "$CI_RUNTIME_DIR/$manifest.env" >/dev/null
  grep -Fx "MINIO_SECRET_KEY=$MINIO_SECRET_KEY" "$CI_RUNTIME_DIR/$manifest.env" >/dev/null
done
if grep -Eq 'MINIO_(ACCESS_KEY|SECRET_KEY)=(minioadmin|changeme)' "$CI_RUNTIME_DIR/host.env" "$CI_RUNTIME_DIR/container.env"; then
  echo 'CI manifests substituted an insecure MinIO default' >&2; exit 1
fi
for unset in MINIO_ACCESS_KEY MINIO_SECRET_KEY; do
  other=MINIO_SECRET_KEY; [[ "$unset" == "$other" ]] && other=MINIO_ACCESS_KEY
  label=${unset#MINIO_}; label=${label%_KEY}; printf -v label 'MinIO %s key is required' "${label,,}"
  if env -u "$unset" "$other=${!other}" PATH="$temp/bin:$PATH" bash "$script" write-infra 2>"$temp/minio.err"; then
    echo "write-infra accepted a missing $unset" >&2; exit 1
  fi
  grep -q "$label" "$temp/minio.err" || {
    echo "Missing $unset did not fail closed with an actionable error" >&2; exit 1;
  }
done
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *' port postgres 5432'*) printf 'localhost:32001\n' ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$temp/bin/docker"
if PATH="$temp/bin:$PATH" bash "$script" write-infra 2>"$temp/endpoint.err"; then
  echo 'Endpoint accepted a localhost mapping' >&2; exit 1
fi
grep -q 'only a strict 127.0.0.1:<port> loopback is accepted, localhost is rejected' "$temp/endpoint.err" || {
  echo 'Endpoint rejection did not explain the strict loopback contract' >&2; exit 1;
}

# Redpanda staging contract: dynamic host ports are allocated at container
# START, so stage-redpanda must create -> start -> resolve/write, never
# resolving the mapping before the container has been started.
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$COMMAND_LOG"
case "$*" in
  *' create redpanda'|*' start redpanda') : ;;
  *' port redpanda 19092')
    while IFS= read -r line; do
      if [[ "$line" == *' start redpanda' ]]; then printf '127.0.0.1:32005\n'; exit 0; fi
    done < "$COMMAND_LOG"
    echo 'service "redpanda" is not running' >&2; exit 1 ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$temp/bin/docker"
rm -f "$CI_RUNTIME_DIR/redpanda-listener.env"
PATH="$temp/bin:$PATH" COMMAND_LOG="$temp/stage.log" bash "$script" stage-redpanda
grep -Fx 'REDPANDA_EXTERNAL_LISTENER=127.0.0.1:32005' "$CI_RUNTIME_DIR/redpanda-listener.env" >/dev/null
node "$(dirname "$0")/ci-command-order.mjs" "$temp/stage.log" ' create redpanda' ' start redpanda' ' port redpanda 19092'
# Exhausted retries must fail closed instead of writing a bogus contract.
rm -f "$CI_RUNTIME_DIR/redpanda-listener.env"
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *' create redpanda'|*' start redpanda') : ;;
  *) echo 'service "redpanda" is not running' >&2; exit 1 ;;
esac
EOF
chmod +x "$temp/bin/docker"
if CI_RUNTIME_PORT_ATTEMPTS=2 CI_RUNTIME_PORT_INTERVAL_SECONDS=0 PATH="$temp/bin:$PATH" bash "$script" stage-redpanda 2>"$temp/stage.err"; then
  echo 'stage-redpanda accepted an unresolvable dynamic mapping' >&2; exit 1
fi
grep -q 'Timed out resolving redpanda dynamic port 19092' "$temp/stage.err" || {
  echo 'Retry exhaustion did not report the unresolved mapping' >&2; exit 1;
}
[[ ! -e "$CI_RUNTIME_DIR/redpanda-listener.env" ]] || {
  echo 'Failed staging wrote a redpanda listener contract' >&2; exit 1;
}

# Browser app staging contract: stage-browser must create -> populate
# runtime-config.js -> START (the bind-mounted inode pins at create), and
# write-browser resolves the dynamic ports only afterwards. Because compose
# mounts the workspace read-only, the host-side single-file mount targets in
# dist/ must exist BEFORE create (runc would otherwise try to create them
# inside the ro mount), so the create mock fails if a target is missing and
# logs an ordering marker once both are present.
rm -f "$repo_root/apps/web/dist/runtime-config.js" "$repo_root/apps/admin/dist/runtime-config.js"
cat > "$temp/bin/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "\$COMMAND_LOG"
case "\$*" in
  *' create web-e2e admin-e2e')
    for target in "$repo_root/apps/web/dist/runtime-config.js" "$repo_root/apps/admin/dist/runtime-config.js"; do
      [[ -f "\$target" ]] || { echo "missing host-side mount target \$target" >&2; exit 1; }
    done
    printf 'mount-targets-present\n' >> "\$COMMAND_LOG" ;;
  *' start web-e2e admin-e2e') : ;;
  *' port web-e2e 3000'|*' port admin-e2e 3002')
    while IFS= read -r line; do
      [[ "\$line" != *' start web-e2e admin-e2e' ]] || {
        [[ "\$*" == *' port admin-e2e 3002'* ]] && printf '127.0.0.1:32008\n' || printf '127.0.0.1:32007\n'
        exit 0
      }
    done < "\$COMMAND_LOG"
    echo 'service "web-e2e" is not running' >&2; exit 1 ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$temp/bin/docker"
PATH="$temp/bin:$PATH" COMMAND_LOG="$temp/browser-stage.log" bash "$script" stage-browser
grep -F 'keycloakBase:"http://127.0.0.1:32004"' "$CI_RUNTIME_DIR/runtime-config.js" >/dev/null
PATH="$temp/bin:$PATH" COMMAND_LOG="$temp/browser-stage.log" bash "$script" write-browser
grep -Fx 'WEB_E2E_PUBLIC_BASE=http://127.0.0.1:32007' "$CI_RUNTIME_DIR/host.env" >/dev/null
grep -Fx 'ADMIN_E2E_PUBLIC_BASE=http://127.0.0.1:32008' "$CI_RUNTIME_DIR/browser-endpoints.env" >/dev/null
node "$(dirname "$0")/ci-command-order.mjs" "$temp/browser-stage.log" ' create web-e2e admin-e2e' 'mount-targets-present' ' start web-e2e admin-e2e' ' port web-e2e 3000'
# No-resolution-before-start: write-browser against never-started containers
# must exhaust its bounded retries instead of emitting any manifest value.
if CI_RUNTIME_PORT_ATTEMPTS=2 CI_RUNTIME_PORT_INTERVAL_SECONDS=0 PATH="$temp/bin:$PATH" \
  COMMAND_LOG="$temp/browser-unstarted.log" bash "$script" write-browser 2>"$temp/browser.err"; then
  echo 'write-browser resolved ports without a started container' >&2; exit 1;
fi
grep -q 'Timed out resolving web-e2e dynamic port 3000' "$temp/browser.err" || {
  echo 'write-browser retry exhaustion did not report the unresolved mapping' >&2; exit 1;
}
