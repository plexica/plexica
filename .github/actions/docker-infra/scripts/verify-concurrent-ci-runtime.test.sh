#!/usr/bin/env bash
set -euo pipefail

dir=$(cd -- "$(dirname -- "$0")" && pwd)
root=$(git rev-parse --show-toplevel); temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
mkdir -p "$temp/scripts" "$temp/bin" "$temp/runtime"; log="$temp/commands.log"
# Serialize multi-line appends into the shared COMMAND_LOG: concurrent A/B
# bootstraps interleave separate >> writes otherwise, breaking the
# line-adjacency assertions below (~20% flake). One flock-guarded append per
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
for helper in verify-ci-runner-capacity.sh start-services.sh wait-services.sh ensure-topics.sh down-ci-runtime-project.sh collect-ci-runtime-diagnostics.sh; do
  cat > "$temp/scripts/$helper" <<'EOF'
#!/usr/bin/env bash
source "$(dirname "$0")/command-log.sh"
append_log "$(basename "$0") $CI_COMPOSE_PROJECT"
  [[ "$(basename "$0")" != wait-services.sh || "${FAIL_WAIT_A:-0}" != 1 || "$CI_COMPOSE_PROJECT" != plexica-ci-a-* ]] || exit 1
[[ "$(basename "$0")" != collect-ci-runtime-diagnostics.sh || "${FAIL_COLLECT:-0}" != 1 ]] || exit 1
mkdir -p "$CI_RUNTIME_DIR"
  base=32000; [[ "$CI_COMPOSE_PROJECT" == plexica-ci-b-* ]] && base=32100
  admin=ci-admin-aaaaaaaaaaaaaaaa; [[ "$CI_COMPOSE_PROJECT" == plexica-ci-b-* ]] && admin=ci-admin-bbbbbbbbbbbbbbbb
  umask 077
  printf 'POSTGRES_HOST_URL=postgresql://user:password@127.0.0.1:%s/plexica\nREDIS_HOST_URL=redis://127.0.0.1:%s\nMINIO_HOST_URL=http://127.0.0.1:%s\nLOKI_HOST_URL=http://127.0.0.1:%s\nMAILPIT_SMTP_URL=smtp://127.0.0.1:%s\nMAILPIT_UI_BASE=http://127.0.0.1:%s\nCORE_API_PUBLIC_BASE=http://127.0.0.1:%s\nKEYCLOAK_HOST_ADMIN_BASE=http://127.0.0.1:%s\nKEYCLOAK_PUBLIC_ISSUER_BASE=http://127.0.0.1:%s\nKEYCLOAK_ADMIN_USER=%s\nKEYCLOAK_ADMIN_PASSWORD=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\nKEYCLOAK_E2E_CLIENT_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\nKAFKA_BROKERS=127.0.0.1:%s\nWEB_E2E_PUBLIC_BASE=http://127.0.0.1:%s\nADMIN_E2E_PUBLIC_BASE=http://127.0.0.1:%s\n' "$base" "$((base + 4))" "$((base + 5))" "$((base + 8))" "$((base + 9))" "$((base + 10))" "$((base + 1))" "$((base + 2))" "$((base + 2))" "$admin" "$((base + 3))" "$((base + 6))" "$((base + 7))" > "$CI_RUNTIME_DIR/host.env"
mkdir -p "$CI_RUNTIME_DIR/diagnostics"; printf 'safe\n' > "$CI_RUNTIME_DIR/diagnostics/result.txt"
EOF
  chmod +x "$temp/scripts/$helper"
done
cp "$dir/ci-runtime-env.sh" "$dir/ci-runtime-path.sh" "$dir/ci-runtime-scope.sh" "$dir/ci-runtime-endpoint-contract.mjs" "$dir/source-ci-runtime-host.sh" "$dir/verify-ci-keycloak-issuer.mjs" "$dir/verify-concurrent-port-gates.sh" "$temp/scripts/"
mv "$temp/scripts/ci-runtime-env.sh" "$temp/scripts/ci-runtime-env-real.sh"
cat > "$temp/scripts/ci-runtime-env.sh" <<'EOF'
#!/usr/bin/env bash
[[ "${FAIL_INIT_B:-0}" != 1 || "${1:-}" != init || "${2:-}" != plexica-ci-b-* ]] || exit 1
exec bash "$(dirname "$0")/ci-runtime-env-real.sh" "$@"
EOF
chmod +x "$temp/scripts/ci-runtime-env.sh"
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
PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runtime" CI_RUNTIME_DIR="$temp/output" CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" COMMAND_LOG="$log" bash "$dir/verify-concurrent-ci-runtime.sh" --full-e2e
# Happy-path teardown contract: the run exits 0 (implicit under set -e) and
# each project is torn down EXACTLY once — the explicit post-proof down for
# project A must not be repeated by the EXIT trap against its deleted dir.
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
for (const project of ["plexica-ci-a-", "plexica-ci-b-"]) {
  const downs = lines.filter((line) => line === `down-ci-runtime-project.sh ${project}` || line.startsWith(`down-ci-runtime-project.sh ${project}`));
  if (downs.length !== 1) process.exit(1);
}
' "$log"
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
const down = lines.findIndex((line) => /down-ci-runtime-project\.sh plexica-ci-a-/.test(line));
if (down < 0) process.exit(1);
const pre = lines.slice(0, down + 1);
const post = lines.slice(down + 1);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const playwrightRe = (filter, spec) =>
  new RegExp(`^pnpm --filter ${escapeRe(filter)} exec playwright test --output (.+)/playwright/([a-z]+)/test-results` +
    (spec ? ` ${escapeRe(spec)}$` : "$"));
// Every Playwright invocation must target a per-project output root and be
// immediately followed by the matching per-project HTML report env line.
for (let i = 0; i < lines.length; i++) {
  if (!/^pnpm --filter \S+ exec playwright test/.test(lines[i])) continue;
  const match = lines[i].match(/--output (.+)\/playwright\/([a-z]+)\/test-results/);
  if (!match || lines[i + 1] !== `html-report ${match[1]}/playwright/${match[2]}/report`) process.exit(1);
}
// Contract specs execute exactly once per project per lifecycle phase:
// bootstrap runs them once per project (2 lines), the post-teardown proof
// re-runs them exactly once for surviving project B (1 line), always with
// the e2e/ prefix and never duplicated within a phase.
for (const filter of ["web", "@plexica/admin"]) {
  if (pre.filter((line) => playwrightRe(filter, "e2e/ci-runtime-contract.spec.ts").test(line)).length !== 2) process.exit(1);
  if (post.filter((line) => playwrightRe(filter, "e2e/ci-runtime-contract.spec.ts").test(line)).length !== 1) process.exit(1);
  if (!pre.some((line) => playwrightRe(filter).test(line))) process.exit(1);
}
// Dedupe proof: every full-suite invocation must carry the contract-skip
// exclusion marker; explicit single-spec invocations must never carry it.
for (let i = 0; i < lines.length; i++) {
  if (!/^pnpm --filter \S+ exec playwright test/.test(lines[i])) continue;
  const isSpec = / e2e\/ci-runtime-contract\.spec\.ts$/.test(lines[i]);
  const skipped = lines[i - 1] === "contract-skip";
  if (isSpec === skipped) process.exit(1);
}
if (lines.some((line) => /(?<!e2e\/)ci-runtime-contract\.spec\.ts$/.test(line))) process.exit(1);
' "$log"
# Cross-project auth proof: acceptance (HTTP 200) and transport-level curl
# failures must both fail the verifier; only a real 400/401 rejection counts.
for mode in CROSS_PROJECT_ACCEPT CROSS_PROJECT_TRANSPORT; do
  if PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runtime" CI_RUNTIME_DIR="$temp/output-$mode" \
    CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" COMMAND_LOG="$temp/$mode.log" \
    env "$mode=1" bash "$dir/verify-concurrent-ci-runtime.sh" --full-e2e >"$temp/$mode.out" 2>&1; then
    echo "Verifier accepted a $mode probe as isolation proof" >&2; exit 1
  fi
done
failure_log="$temp/failure.log"
if PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runtime" CI_RUNTIME_DIR="$temp/output" CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" COMMAND_LOG="$failure_log" FAIL_WAIT_A=1 bash "$dir/verify-concurrent-ci-runtime.sh" --full-e2e; then
  echo 'Verifier accepted a failed runtime command' >&2; exit 1
fi
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
const collect = lines.findIndex((line) => /collect-ci-runtime-diagnostics\.sh plexica-ci-a-/.test(line));
const downA = lines.findIndex((line) => /down-ci-runtime-project\.sh plexica-ci-a-/.test(line));
const downB = lines.findIndex((line) => /down-ci-runtime-project\.sh plexica-ci-b-/.test(line));
if (collect < 0 || downA < 0 || downB < 0 || collect > downA || collect > downB || lines.some((line) => /plexica-ci-(?!a-|b-)/.test(line))) process.exit(1);
' "$failure_log"
if PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runtime" CI_RUNTIME_DIR="$temp/output" CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" COMMAND_LOG="$temp/init-failure.log" FAIL_INIT_B=1 bash "$dir/verify-concurrent-ci-runtime.sh" --full-e2e; then
  echo 'Verifier accepted a partial runtime initialization failure' >&2; exit 1
fi
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
if (!lines.some((line) => /collect-ci-runtime-diagnostics\.sh plexica-ci-a-/.test(line)) || !lines.some((line) => /down-ci-runtime-project\.sh plexica-ci-a-/.test(line)) || lines.some((line) => /plexica-ci-b-/.test(line))) process.exit(1);
' "$temp/init-failure.log"
if PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runtime" CI_RUNTIME_DIR="$temp/output" CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" COMMAND_LOG="$temp/diagnostics.log" FAIL_COLLECT=1 bash "$dir/verify-concurrent-ci-runtime.sh" --full-e2e; then
  echo 'Verifier accepted a failed diagnostics collection' >&2; exit 1
fi
signal_log="$temp/signal.log"
awk '/^trap .* INT TERM$/{print; exit} {print}' "$dir/verify-concurrent-ci-runtime.sh" > "$temp/scripts/verify-head.sh"
(
  export PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runtime" CI_RUNTIME_DIR="$temp/output-signal"
  export CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" COMMAND_LOG="$signal_log"
  source "$temp/scripts/verify-head.sh" --full-e2e
  initialized+=(plexica-signal-a)
  cleanup || true
  cleanup || true
)
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
const count = (name) => lines.filter((line) => line === `${name} plexica-signal-a`).length;
if (count("down-ci-runtime-project.sh") !== 1 || count("collect-ci-runtime-diagnostics.sh") !== 1) process.exit(1);
' "$signal_log"
