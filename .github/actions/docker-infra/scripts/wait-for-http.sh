#!/usr/bin/env bash
set -euo pipefail

url=${1:?URL is required}
timeout=${CI_RUNTIME_HEALTH_TIMEOUT_SECONDS:-60}
interval=${CI_RUNTIME_HEALTH_INTERVAL_SECONDS:-1}
[[ "$timeout" =~ ^[0-9]+$ && "$interval" =~ ^[1-9][0-9]*$ ]] || {
  echo 'Health timeout and interval must be positive integer seconds' >&2; exit 1;
}

deadline=$(( $(date +%s) + timeout ))
while true; do
  if curl --fail --silent --show-error --max-time 5 "$url" >/dev/null; then exit 0; fi
  (( $(date +%s) >= deadline )) && { echo "Timed out waiting for $url" >&2; exit 1; }
  sleep "$interval"
done
