#!/usr/bin/env bash
set -euo pipefail

entrypoint="$(git rev-parse --show-toplevel)/infra/redpanda/ci-entrypoint.sh"
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
cat > "$temp/rpk" <<'EOF'
#!/bin/sh
# The entrypoint must drive the broker through rpk (as the pinned image's
# entrypoint does), not the raw binary: only rpk understands --set.
if [ "$1" != redpanda ]; then echo 'expected rpk redpanda subcommand' >&2; exit 64; fi
shift
printf '%s\n' "$*" > "$REDPANDA_COMMAND_LOG"
EOF
chmod +x "$temp/rpk"
printf 'REDPANDA_EXTERNAL_LISTENER=127.0.0.1:32005\n' > "$temp/listener.env"
PATH="$temp:$PATH" REDPANDA_LISTENER_CONTRACT="$temp/listener.env" REDPANDA_COMMAND_LOG="$temp/command" \
  sh "$entrypoint"
grep -Fx 'start --smp 1 --memory 256M --overprovisioned --set redpanda.developer_mode=true --kafka-addr PLAINTEXT://0.0.0.0:9092,OUTSIDE://0.0.0.0:19092 --advertise-kafka-addr PLAINTEXT://redpanda:9092,OUTSIDE://127.0.0.1:32005 --pandaproxy-addr 0.0.0.0:8082' "$temp/command" >/dev/null
printf 'REDPANDA_EXTERNAL_LISTENER=localhost:32005\n' > "$temp/listener.env"
if PATH="$temp:$PATH" REDPANDA_LISTENER_CONTRACT="$temp/listener.env" sh "$entrypoint" >/dev/null 2>&1; then
  echo 'Redpanda accepted a localhost listener' >&2; exit 1
fi
# Gated parking: with no contract present the entrypoint must stay alive
# (polling) so Docker allocates the dynamic port while it waits — not exit,
# which would leave a stopped container whose port cannot be resolved.
REDPANDA_LISTENER_CONTRACT="$temp/absent-listener.env" sh "$entrypoint" >/dev/null 2>&1 &
parked=$!
sleep 3
kill -0 "$parked" 2>/dev/null || {
  echo 'Entrypoint exited instead of parking for a missing contract' >&2; exit 1;
}
kill "$parked" 2>/dev/null || true
wait "$parked" 2>/dev/null || true
# Parking is bounded: an exhausted wait fails closed instead of hanging.
if REDPANDA_LISTENER_CONTRACT="$temp/absent-listener.env" REDPANDA_PARK_TIMEOUT_SECONDS=0 \
  timeout 10 sh "$entrypoint" >/dev/null 2>&1; then
  echo 'Entrypoint accepted a missing contract after parking' >&2; exit 1
fi
