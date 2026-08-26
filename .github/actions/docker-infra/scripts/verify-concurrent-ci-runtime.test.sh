#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/ci-test-env-guard.sh"

dir=$(cd -- "$(dirname -- "$0")" && pwd)
root=$(git rev-parse --show-toplevel); temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
mkdir -p "$temp/scripts" "$temp/bin" "$temp/runtime"; log="$temp/commands.log"
mkdir -p "$temp/e2e-ca"; printf 'ca\n' > "$temp/e2e-ca/ca.crt"; printf 'ca\n' > "$temp/e2e-ca/postgres-ca.crt"
# Serialize multi-line appends into the shared COMMAND_LOG: concurrent A/B
# bootstraps interleave separate >> writes otherwise, breaking the
# line-adjacency assertions (~20% flake). One flock-guarded append per
# invocation keeps every stream's lines contiguous and ordered.
cat > "$temp/scripts/command-log.sh" <<'EOF'
append_log() {
  {
    flock -x 9
    local line
    for line in "$@"; do printf '%s\n' "$line" >&9; done
  } 9>>"$COMMAND_LOG"
}
EOF
for helper in verify-ci-runner-capacity.sh start-services.sh wait-services.sh ensure-topics.sh publish-plugin-assets.sh down-ci-runtime-project.sh collect-ci-runtime-diagnostics.sh; do
  cat > "$temp/scripts/$helper" <<'EOF'
#!/usr/bin/env bash
source "$(dirname "$0")/command-log.sh"
append_log "$(basename "$0") $CI_COMPOSE_PROJECT"
  [[ "$(basename "$0")" != wait-services.sh || "${FAIL_WAIT_A:-0}" != 1 || "$CI_COMPOSE_PROJECT" != plexica-ci-a-* ]] || exit 1
[[ "$(basename "$0")" != collect-ci-runtime-diagnostics.sh || "${FAIL_COLLECT:-0}" != 1 ]] || exit 1
[[ "$(basename "$0")" != down-ci-runtime-project.sh || "${FAIL_DOWN_A_ONCE:-0}" != 1 || "$CI_COMPOSE_PROJECT" != plexica-ci-a-* ]] || {
  if [[ ! -e "$CI_RUNTIME_DIR/.down-retried" ]]; then mkdir -p "$CI_RUNTIME_DIR"; touch "$CI_RUNTIME_DIR/.down-retried"; exit 1; fi
}
mkdir -p "$CI_RUNTIME_DIR"
  base=32000; [[ "$CI_COMPOSE_PROJECT" == plexica-ci-b-* ]] && base=32100
  admin=ci-admin-aaaaaaaaaaaaaaaa; [[ "$CI_COMPOSE_PROJECT" == plexica-ci-b-* ]] && admin=ci-admin-bbbbbbbbbbbbbbbb
  umask 077
  printf 'POSTGRES_HOST_URL=postgresql://user:password@127.0.0.1:%s/plexica\nREDIS_HOST_URL=redis://127.0.0.1:%s\nMINIO_HOST_URL=http://127.0.0.1:%s\nMINIO_ACCESS_KEY=aaaaaaaaaaaaaaaaaaaaaaaa\nMINIO_SECRET_KEY=1111111111111111111111111111111111111111111111111111111111111111\nLOKI_HOST_URL=http://127.0.0.1:%s\nMAILPIT_SMTP_URL=smtp://127.0.0.1:%s\nMAILPIT_UI_BASE=http://127.0.0.1:%s\nCORE_API_PUBLIC_BASE=http://127.0.0.1:%s\nKEYCLOAK_HOST_ADMIN_BASE=http://127.0.0.1:%s\nKEYCLOAK_PUBLIC_ISSUER_BASE=http://127.0.0.1:%s\nKEYCLOAK_ADMIN_USER=%s\nKEYCLOAK_ADMIN_PASSWORD=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\nKEYCLOAK_E2E_CLIENT_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\nKAFKA_BROKERS=127.0.0.1:%s\nWEB_E2E_PUBLIC_BASE=http://127.0.0.1:%s\nADMIN_E2E_PUBLIC_BASE=http://127.0.0.1:%s\nPLUGIN_DB_SSL_MODE=disable\n' "$base" "$((base + 4))" "$((base + 5))" "$((base + 8))" "$((base + 9))" "$((base + 10))" "$((base + 1))" "$((base + 2))" "$((base + 2))" "$admin" "$((base + 3))" "$((base + 6))" "$((base + 7))" > "$CI_RUNTIME_DIR/host.env"
mkdir -p "$CI_RUNTIME_DIR/diagnostics"; printf 'safe\n' > "$CI_RUNTIME_DIR/diagnostics/result.txt"
EOF
  chmod +x "$temp/scripts/$helper"
done
# Canonical-seeding mock: records the per-app invocation and publishes the
# per-app credential manifest that run_playwright sources before every suite,
# mirroring the real run-e2e-global-setup.sh contract (%q-encoded exports).
cat > "$temp/scripts/run-e2e-global-setup.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/command-log.sh"
app=${1:?Usage: run-e2e-global-setup.sh <web|admin>}
append_log "run-e2e-global-setup.sh $app $CI_COMPOSE_PROJECT"
mkdir -p "$CI_RUNTIME_DIR"
{
  printf 'export %s=%q\n' PLAYWRIGHT_SUPER_ADMIN_USER "super-$app-user" \
    PLAYWRIGHT_SUPER_ADMIN_PASS 'SuperPass!1' PLAYWRIGHT_SUPER_ADMIN_UUID "uuid-$app" \
    PLAYWRIGHT_E2E_KEYCLOAK_CLIENT_ID "client-$app" \
    PLAYWRIGHT_E2E_KEYCLOAK_CLIENT_SECRET "secret-$app-000000000000000000000" \
    PLAYWRIGHT_E2E_KEYCLOAK_CLIENT_UUID "client-uuid-$app"
} > "$CI_RUNTIME_DIR/setup-$app.env"
chmod 600 "$CI_RUNTIME_DIR/setup-$app.env"
EOF
chmod +x "$temp/scripts/run-e2e-global-setup.sh"
cp "$dir/ci-runtime-env.sh" "$dir/ci-runtime-path.sh" "$dir/ci-runtime-scope.sh" "$dir/ci-runtime-endpoint-contract.mjs" "$dir/source-ci-runtime-host.sh" "$dir/verify-ci-keycloak-issuer.mjs" "$dir/verify-concurrent-port-gates.sh" "$dir/ci-runtime-e2e-suite.sh" "$dir/verify-concurrent-log-contract.mjs" "$temp/scripts/"
mv "$temp/scripts/ci-runtime-env.sh" "$temp/scripts/ci-runtime-env-real.sh"
cat > "$temp/scripts/ci-runtime-env.sh" <<'EOF'
#!/usr/bin/env bash
[[ "${FAIL_INIT_B:-0}" != 1 || "${1:-}" != init || "${2:-}" != plexica-ci-b-* ]] || exit 1
exec bash "$(dirname "$0")/ci-runtime-env-real.sh" "$@"
EOF
chmod +x "$temp/scripts/ci-runtime-env.sh"
contract() { node "$temp/scripts/verify-concurrent-log-contract.mjs" "$@"; }
run_verifier() { # run_verifier <command-log> [VAR=value...]
  local log_file="$1"; shift
  PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runtime" E2E_POSTGRES_TLS_SOURCE="$temp/e2e-ca" \
    CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" COMMAND_LOG="$log_file" env "$@" \
    bash "$dir/verify-concurrent-ci-runtime.sh" --full-e2e
}
expect_failure() { # expect_failure <description> <command...>
  local description="$1"; shift
  if "$@" >"$temp/fail.out" 2>&1; then echo "Verifier accepted: $description" >&2; exit 1; fi
}
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
source "$(dirname "$0")/../scripts/command-log.sh"
append_log "docker $*"
if [[ "$*" =~ --project-name[[:space:]](plexica-ci-[a-z0-9-]+) ]]; then
  project=${BASH_REMATCH[1]}
  [[ "$CI_COMPOSE_PROJECT" == "$project" && "$CI_RUNTIME_DIR" == "$RUNNER_TEMP/plexica-ci/$project" ]] || exit 93
fi
case "$*" in
  *'--project-name plexica-ci-a-'*' ps -q '*) printf 'container-a\n' ;;
  *'--project-name plexica-ci-b-'*' ps -q '*) printf 'container-b\n' ;;
  *'inspect'*container-a*) printf '32001:3001/tcp\n' ;;
  *'inspect'*container-b*) printf '32101:3001/tcp\n' ;;
  *'ps -aq'*|*'network ls -q'*|*'volume ls -q'*) ;;
  *'network ls'*|*'volume ls'*) printf 'resource project\n' ;;
esac
EOF
cat > "$temp/bin/pnpm" <<'EOF'
#!/usr/bin/env bash
source "$(dirname "$0")/../scripts/command-log.sh"
# Log a marker BEFORE the invocation so tests can pair every full-suite
# Playwright run with its mandatory contract-spec exclusion flag, and the
# per-project HTML report dir after it — all in ONE serialized append.
lines=()
[[ ${CI_RUNTIME_SKIP_CONTRACT_SPEC:-0} != 1 ]] || lines+=("contract-skip")
lines+=("pnpm $*")
[[ -z "${PLAYWRIGHT_HTML_REPORT:-}" ]] || lines+=("html-report $PLAYWRIGHT_HTML_REPORT")
append_log "${lines[@]}"
EOF
cat > "$temp/bin/curl" <<'EOF'
#!/usr/bin/env bash
source "$(dirname "$0")/../scripts/command-log.sh"
append_log "curl $*"
HAS_WRITE_OUT=''; [[ "$*" == *--write-out* ]] && HAS_WRITE_OUT=1
emit() { # emit <status> <body> — honours --write-out like the real curl
  if [[ -n "${HAS_WRITE_OUT:-}" ]]; then printf '%s\n%s\n' "$2" "$1"; else printf '%s\n' "$2"; fi
}
token() { payload=$(printf '{"iss":"%s/realms/master"}' "$KEYCLOAK_PUBLIC_ISSUER_BASE" | base64 | tr '+/' '-_' | tr -d '=\n'); emit 200 "{\"access_token\":\"x.$payload.y\"}"; }
if [[ "$*" == *'openid-connect/token'* ]]; then
  # Cross-project probe (credentials from A against B's admin endpoint):
  # model a real Keycloak rejection unless the harness forces acceptance.
  if [[ -n "${KEYCLOAK_ADMIN_USER:-}" && "$*" != *"username=$KEYCLOAK_ADMIN_USER"* ]]; then
    if [[ ${CROSS_PROJECT_ACCEPT:-0} == 1 ]]; then token;
    elif [[ ${CROSS_PROJECT_TRANSPORT:-0} == 1 ]]; then echo 'curl: (28) Operation timed out' >&2; exit 28;
    else emit 400 'invalid_grant'; fi
    exit 0
  fi
  token
fi
if [[ "$*" == *'.well-known'* ]]; then emit 200 "{\"issuer\":\"$KEYCLOAK_PUBLIC_ISSUER_BASE/realms/master\"}"; fi
exit 0
EOF
chmod +x "$temp/bin/"*

# Happy path: exits 0, teardown exactly once per project, bootstrap ordering,
# canonical seeding, per-project outputs, contract-skip pairing. The explicit
# rc pin guards the success path against cleanup regressions: the EXIT trap
# re-runs down() for every initialized project and must stay a no-op for
# already-torn-down ones (rmi-already-gone semantics) without flipping the
# script's exit code away from 0.
run_verifier "$log" CI_RUNTIME_DIR="$temp/output"; happy_rc=$?
[[ "$happy_rc" == 0 ]] || { echo "Happy path exited $happy_rc, expected 0" >&2; exit 1; }
contract teardown-once "$log"
contract bootstrap-order "$log"
contract canonical-seeding "$log"
contract outputs-and-skips "$log"

# Cross-project auth proof: acceptance (HTTP 200) and transport-level curl
# failures must both fail the verifier; only a real 400/401 rejection counts.
for mode in CROSS_PROJECT_ACCEPT CROSS_PROJECT_TRANSPORT; do
  expect_failure "$mode probe accepted as isolation proof" \
    run_verifier "$temp/$mode.log" "$mode=1" CI_RUNTIME_DIR="$temp/output-$mode"
done
# TLS gate: bootstrapping without the admission-provisioned CA source must
# fail closed — plugin sidecars could not reach the contract postgres.
expect_failure 'missing postgres TLS CA source' \
  env PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runtime" CI_RUNTIME_DIR="$temp/output-notls" \
    CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" COMMAND_LOG="$temp/notls.log" \
    bash "$dir/verify-concurrent-ci-runtime.sh" --full-e2e

expect_failure 'failed runtime command' run_verifier "$temp/failure.log" CI_RUNTIME_DIR="$temp/output" FAIL_WAIT_A=1
# The failing project must be NAMED on stderr, not just signalled via exit 1.
grep -q 'Bootstrap failed for:' "$temp/fail.out" || { echo 'Failed project not reported' >&2; exit 1; }
contract failure-flow "$temp/failure.log"
# Regression (CI run 32916152024): a mid-run failure must stay fail-closed
# even though cleanup then performs only idempotent no-op teardown work —
# the retried down succeeds via the already-marked path, yet the original
# nonzero status must still win, and the guard must SAY why it failed.
expect_failure 'explicit project down failure stays fail-closed' \
  run_verifier "$temp/down-a.log" CI_RUNTIME_DIR="$temp/output-downa" FAIL_DOWN_A_ONCE=1
grep -q 'Cleanup failed:' "$temp/fail.out" || { echo 'Cleanup failure reason not reported' >&2; exit 1; }
expect_failure 'partial runtime initialization failure' run_verifier "$temp/init-failure.log" CI_RUNTIME_DIR="$temp/output" FAIL_INIT_B=1
contract init-failure "$temp/init-failure.log"
expect_failure 'failed diagnostics collection' run_verifier "$temp/diagnostics.log" CI_RUNTIME_DIR="$temp/output" FAIL_COLLECT=1

# Signal handling: INT/TERM cleanup runs diagnostics+teardown exactly once,
# and a repeated cleanup call is a no-op (idempotent trap).
awk '/^trap .* INT TERM$/{print; exit} {print}' "$dir/verify-concurrent-ci-runtime.sh" > "$temp/scripts/verify-head.sh"
(
  export PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runtime" E2E_POSTGRES_TLS_SOURCE="$temp/e2e-ca" CI_RUNTIME_DIR="$temp/output-signal"
  signal_log="$temp/signal.log"
  export CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" COMMAND_LOG="$signal_log"
  source "$temp/scripts/verify-head.sh" --full-e2e
  initialized+=(plexica-signal-a)
  cleanup || true
  cleanup || true
)
contract signal-once "$temp/signal.log"
