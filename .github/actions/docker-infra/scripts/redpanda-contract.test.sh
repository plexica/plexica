#!/usr/bin/env bash
set -euo pipefail

entrypoint="$(git rev-parse --show-toplevel)/infra/redpanda/ci-entrypoint.sh"
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
cat > "$temp/redpanda" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" > "$REDPANDA_COMMAND_LOG"
EOF
chmod +x "$temp/redpanda"
printf 'REDPANDA_EXTERNAL_LISTENER=127.0.0.1:32005\n' > "$temp/listener.env"
PATH="$temp:$PATH" REDPANDA_LISTENER_CONTRACT="$temp/listener.env" REDPANDA_COMMAND_LOG="$temp/command" \
  sh "$entrypoint"
grep -Fx 'start --smp 1 --memory 256M --overprovisioned --set redpanda.developer_mode=true --kafka-addr PLAINTEXT://0.0.0.0:9092,OUTSIDE://0.0.0.0:19092 --advertise-kafka-addr PLAINTEXT://redpanda:9092,OUTSIDE://127.0.0.1:32005 --pandaproxy-addr 0.0.0.0:8082' "$temp/command" >/dev/null
printf 'REDPANDA_EXTERNAL_LISTENER=localhost:32005\n' > "$temp/listener.env"
if PATH="$temp:$PATH" REDPANDA_LISTENER_CONTRACT="$temp/listener.env" sh "$entrypoint" >/dev/null 2>&1; then
  echo 'Redpanda accepted a localhost listener' >&2; exit 1
fi
