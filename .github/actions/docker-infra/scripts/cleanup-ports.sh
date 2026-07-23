#!/usr/bin/env bash
set -euo pipefail

for port in "$@"; do
  pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [[ -n "$pid" ]]; then
    echo "Killing process $pid on port $port"
    kill -9 "$pid" 2>/dev/null || true
  fi
done
