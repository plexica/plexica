#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/ci-test-env-guard.sh"

dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
mkdir -p "$temp/scripts" "$temp/bin" "$temp/e2e-ca"
printf 'ca\n' > "$temp/e2e-ca/ca.crt"
log="$temp/commands.log"
project=plexica-ci-single-000001
runtime="$temp/runner-temp/plexica-ci/$project"; mkdir -p "$runtime"

# Pure reuse per design: the real ci-runtime-e2e-suite.sh is copied
# unmodified, exactly as verify-concurrent-ci-runtime.test.sh does for the
# two-project contract. Only its leaf collaborators are faked.
cp "$dir/ci-runtime-e2e-suite.sh" "$temp/scripts/"

# Fakes KAFKA_BROKERS resolution (sourced, not executed — sets the variable
# in the CALLING script so the downstream Kafka round-trip call can use it;
# this is a stronger check than logging a call, since it proves real
# propagation rather than just invocation).
cat > "$temp/scripts/source-ci-runtime-host.sh" <<'EOF'
export KAFKA_BROKERS=127.0.0.1:19999
EOF

cat > "$temp/scripts/ensure-topics.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
: "${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}"
printf 'ensure-topics %s\n' "$CI_COMPOSE_PROJECT" >> "$COMMAND_LOG"
EOF

cat > "$temp/scripts/publish-plugin-assets.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
: "${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}"
printf 'publish-plugin-assets %s\n' "$CI_COMPOSE_PROJECT" >> "$COMMAND_LOG"
EOF

cat > "$temp/scripts/run-e2e-global-setup.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
app=${1:?Usage: run-e2e-global-setup.sh <web|admin>}
printf 'run-e2e-global-setup %s %s\n' "$app" "$CI_COMPOSE_PROJECT" >> "$COMMAND_LOG"
mkdir -p "$CI_RUNTIME_DIR"
printf 'export PLAYWRIGHT_SUPER_ADMIN_USER=%q\n' "super-$app" > "$CI_RUNTIME_DIR/setup-$app.env"
EOF
chmod +x "$temp/scripts/"*.sh

# Env-var capture (not just the command line): a regression that broke
# CI_RUNTIME_CONTRACT/PLAYWRIGHT_BROWSER_CHANNEL propagation into the
# Playwright/roundtrip subshell would otherwise pass unnoticed.
cat > "$temp/bin/pnpm" <<'EOF'
#!/usr/bin/env bash
line="pnpm $*"
[[ "${CI_RUNTIME_SKIP_CONTRACT_SPEC:-0}" != 1 ]] || line="contract-skip $line"
line="$line [contract=${CI_RUNTIME_CONTRACT:-unset} channel=${PLAYWRIGHT_BROWSER_CHANNEL:-unset}]"
printf '%s\n' "$line" >> "$COMMAND_LOG"
EOF
chmod +x "$temp/bin/pnpm"

run() {
  PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runner-temp" CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" \
    COMMAND_LOG="$1" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" \
    E2E_POSTGRES_TLS_SOURCE="$temp/e2e-ca" \
    bash "$dir/run-single-project-e2e-suite.sh"
}

run "$log"
[[ -s "$log" ]] || { echo 'No commands were recorded' >&2; exit 1; }
mapfile -t lines < "$log"
expected=(
  "ensure-topics $project"
)
for i in "${!expected[@]}"; do
  [[ "${lines[$i]:-}" == "${expected[$i]}" ]] || {
    echo "Line $i: expected '${expected[$i]}', got '${lines[$i]:-<missing>}'" >&2; exit 1;
  }
done
[[ "${lines[1]:-}" == *'verify-kafka-roundtrip.mjs 127.0.0.1:19999 '"$project"* ]] ||
  { echo "Kafka round-trip did not run 2nd with the resolved KAFKA_BROKERS: ${lines[1]:-<missing>}" >&2; exit 1; }
[[ "${lines[2]:-}" == "publish-plugin-assets $project" ]] ||
  { echo "publish-plugin-assets did not run 3rd: ${lines[2]:-<missing>}" >&2; exit 1; }
[[ "${lines[3]:-}" == "run-e2e-global-setup web $project" ]] || { echo 'web global setup did not run 4th' >&2; exit 1; }
[[ "${lines[4]:-}" == "run-e2e-global-setup admin $project" ]] || { echo 'admin global setup did not run 5th' >&2; exit 1; }
[[ "${lines[5]:-}" == *'--filter web exec playwright test'*'ci-runtime-contract.spec.ts'* ]] ||
  { echo 'web contract spec did not run 6th' >&2; exit 1; }
[[ "${lines[6]:-}" == *'--filter @plexica/admin exec playwright test'*'ci-runtime-contract.spec.ts'* ]] ||
  { echo 'admin contract spec did not run 7th' >&2; exit 1; }
[[ "${lines[7]:-}" == contract-skip*'--filter web exec playwright test'* && "${lines[7]}" != *'ci-runtime-contract.spec.ts'* ]] ||
  { echo 'full web suite did not run 8th excluding the contract spec' >&2; exit 1; }
[[ "${lines[8]:-}" == contract-skip*'--filter @plexica/admin exec playwright test'* && "${lines[8]}" != *'ci-runtime-contract.spec.ts'* ]] ||
  { echo 'full admin suite did not run 9th excluding the contract spec' >&2; exit 1; }
[[ ${#lines[@]} -eq 9 ]] || { echo "Expected exactly 9 recorded commands, got ${#lines[@]}" >&2; exit 1; }
for i in 5 6 7 8; do
  [[ "${lines[$i]}" == *'[contract=1 channel=chrome]' ]] ||
    { echo "Line $i did not propagate CI_RUNTIME_CONTRACT/PLAYWRIGHT_BROWSER_CHANNEL: ${lines[$i]}" >&2; exit 1; }
done

# TLS precondition must fail closed: both when the CA source is entirely
# unset AND when it is set but the CA file itself is missing (only the
# first branch was previously covered).
if PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runner-temp" CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" \
  COMMAND_LOG="$temp/notls.log" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" \
  bash "$dir/run-single-project-e2e-suite.sh"; then
  echo 'Suite ran without the E2E Postgres TLS CA source' >&2; exit 1
fi
if PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/runner-temp" CI_RUNTIME_SCRIPTS_DIR="$temp/scripts" \
  COMMAND_LOG="$temp/noca.log" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" \
  E2E_POSTGRES_TLS_SOURCE="$temp/empty-ca-dir" \
  bash "$dir/run-single-project-e2e-suite.sh"; then
  echo 'Suite ran with a TLS CA source directory missing ca.crt' >&2; exit 1
fi

echo 'run-single-project-e2e-suite.test.sh: all cases passed'
