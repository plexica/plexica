#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
runtime_dir() { printf '%s/plexica-ci/%s' "${RUNNER_TEMP:?RUNNER_TEMP is required}" "$1"; }
valid_project() { [[ "$1" =~ ^plexica-ci-[a-z0-9][a-z0-9-]{5,45}$ ]]; }
atomic_append() {
  local file="$1" key="$2" value="$3" temp
  temp=$(mktemp "${file}.XXXXXX")
  { [[ -f "$file" ]] && grep -v "^${key}=" "$file" || true; printf '%s=%q\n' "$key" "$value"; } > "$temp"
  chmod 600 "$temp"; mv "$temp" "$file"
}
loopback_url() {
  local value="$1" host
  host=$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$value" 2>/dev/null) || return 1
  [[ "$host" == 127.0.0.1 || "$host" == localhost || "$host" == ::1 ]]
}
container_value() {
  local value="$1"
  [[ "$value" != *'host.docker.internal'* && "$value" != *'127.0.0.1'* && "$value" != *'localhost:'* ]]
}
init() {
  local project="$1" dir
  valid_project "$project" || fail 'Invalid CI Compose project ID'
  dir=$(runtime_dir "$project"); (umask 077; mkdir -p "$dir")
  chmod 700 "$dir"
  : > "$dir/host.env"; : > "$dir/container.env"; : > "$dir/runtime-config.js"; : > "$dir/redpanda-listener.env"
  chmod 600 "$dir"/*
  printf '%s\n' "$dir"
}
write_host() { loopback_url "$3" || fail 'Host contract requires a loopback URL'; atomic_append "$1/host.env" "$2" "$3"; }
write_container() { container_value "$3" || fail 'Container contract must use Compose DNS, never host loopback'; atomic_append "$1/container.env" "$2" "$3"; }
browser_config() {
  local dir="$1" issuer="$2"; loopback_url "$issuer" || fail 'Browser Keycloak issuer must be manifest loopback URL'
  printf "window.__PLEXICA_RUNTIME_CONFIG__=Object.freeze({apiBase:'',keycloakBase:%q});\n" "$issuer" > "$dir/runtime-config.js"
  chmod 600 "$dir/runtime-config.js"
}
assert_host() { loopback_url "$2" || fail "Host consumer received non-loopback $1"; }
assert_container() { container_value "$2" || fail "Container consumer received host endpoint $1"; }
case "${1:-}" in
  init) init "${2:-}" ;;
  write-host) write_host "${2:-}" "${3:-}" "${4:-}" ;;
  write-container) write_container "${2:-}" "${3:-}" "${4:-}" ;;
  browser-config) browser_config "${2:-}" "${3:-}" ;;
  assert-host) assert_host "${2:-}" "${3:-}" ;;
  assert-container) assert_container "${2:-}" "${3:-}" ;;
  *) fail 'Usage: ci-runtime-env.sh init|write-host|write-container|browser-config|assert-host|assert-container' ;;
esac
