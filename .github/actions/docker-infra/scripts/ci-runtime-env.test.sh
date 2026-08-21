#!/usr/bin/env bash
set -euo pipefail

temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
export RUNNER_TEMP="$temp"
script="$(dirname "$0")/ci-runtime-env.sh"
dir=$(bash "$script" init plexica-ci-contract-123456)
[[ $(stat -c %a "$dir") == 700 && $(stat -c %a "$dir/host.env") == 600 ]]
bash "$script" write-host "$dir" KEYCLOAK_HOST_ADMIN_BASE http://127.0.0.1:32000
bash "$script" write-container "$dir" KEYCLOAK_URL http://keycloak:8080
bash "$script" browser-config "$dir" http://127.0.0.1:32000
grep -F "apiBase:''" "$dir/runtime-config.js" >/dev/null
if bash "$script" write-container "$dir" BAD http://127.0.0.1:3001; then exit 1; fi
if bash "$script" write-host "$dir" BAD http://keycloak:8080; then exit 1; fi
