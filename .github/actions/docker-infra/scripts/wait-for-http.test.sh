#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/ci-test-env-guard.sh"

dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
mkdir "$temp/bin"
cat > "$temp/bin/curl" <<'EOF'
#!/usr/bin/env bash
if [[ -f "$COUNT" ]]; then count=$(<"$COUNT"); else count=0; fi
count=$((count + 1)); printf '%s' "$count" > "$COUNT"
[[ "$count" -ge "${SUCCEED_ON:-99}" ]]
EOF
cat > "$temp/bin/sleep" <<'EOF'
#!/usr/bin/env bash
:
EOF
chmod +x "$temp/bin/"*
COUNT="$temp/count" SUCCEED_ON=3 PATH="$temp/bin:$PATH" \
  bash "$dir/wait-for-http.sh" http://127.0.0.1:32000
[[ $(<"$temp/count") == 3 ]] || { echo 'Health polling did not retry before success' >&2; exit 1; }
if COUNT="$temp/timeout" SUCCEED_ON=99 CI_RUNTIME_HEALTH_TIMEOUT_SECONDS=0 PATH="$temp/bin:$PATH" \
  bash "$dir/wait-for-http.sh" http://127.0.0.1:32000; then
  echo 'Health polling accepted an unavailable endpoint' >&2; exit 1
fi
