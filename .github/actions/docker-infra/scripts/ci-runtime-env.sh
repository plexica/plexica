#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
runtime_dir() { printf '%s/plexica-ci/%s' "${RUNNER_TEMP:?RUNNER_TEMP is required}" "$1"; }
validate_dir() { validate_ci_runtime "$(basename -- "$1")" "$1" || fail 'Unsafe runtime directory'; }
# Compose resolves env_file entries literally (no shell unquoting), while the
# shell-sourced manifests decode %q. Writer format follows each file's actual
# consumer: container.env and browser-endpoints.env feed Compose env_file and
# are written raw after rejecting any character a literal parser could mangle;
# everything else stays %q for bash source consumers.
compose_literal_re='^[A-Za-z0-9_.:?&=+,/@%~-]+$'
compose_literal_safe() { [[ "$1" =~ $compose_literal_re ]]; }
atomic_write() {
  local dir="$1" name="$2" kind="$3" file temp key value line skip i mode
  validate_dir "$dir"; file="$dir/${name}.env"
  shift 3; local entries=("$@")
  (( ${#entries[@]} > 1 && ${#entries[@]} % 2 == 0 )) || fail 'Manifest entries must be key/value pairs'
  for ((i = 0; i < ${#entries[@]}; i += 2)); do
    node "$script_dir/ci-runtime-endpoint-contract.mjs" "$kind" "${entries[i]}" "${entries[i + 1]}" || fail "Invalid $kind endpoint contract"
  done
  case "$name" in
    container|browser-endpoints) mode=raw ;;
    *) mode=quoted ;;
  esac
  for ((i = 0; i < ${#entries[@]}; i += 2)); do
    if [[ "$mode" == raw ]]; then
      compose_literal_safe "${entries[i + 1]}" || fail "Value for ${entries[i]} is not Compose env_file literal-safe"
    fi
  done
  temp=$(mktemp "${file}.XXXXXX")
  {
    while IFS= read -r line; do
      skip=0
      for ((i = 0; i < ${#entries[@]}; i += 2)); do [[ "$line" == "${entries[i]}="* ]] && skip=1; done
      (( skip )) || printf '%s\n' "$line"
    done < "$file"
    for ((i = 0; i < ${#entries[@]}; i += 2)); do
      key=${entries[i]}; value=${entries[i + 1]}
      if [[ "$mode" == raw ]]; then printf '%s=%s\n' "$key" "$value"; else printf '%s=%q\n' "$key" "$value"; fi
    done
  } > "$temp"
  chmod 600 "$temp"; mv "$temp" "$file"
}
init() {
  local project="$1" dir
  dir=$(init_ci_runtime "$project") || fail 'Invalid CI Compose project ID'
  chmod 700 "$dir"
  # sidecar-images.env and browser-endpoints.env must exist before the first
  # compose render: the CI overlay resolves env_file eagerly at project-load
  # time, while their values are discovered later (write-infra/write-browser
  # stages) before any dependent service is created. Consumers fail closed.
  : > "$dir/host.env"; : > "$dir/container.env"; : > "$dir/runtime-config.js"; : > "$dir/redpanda-listener.env"; : > "$dir/sidecar-images.env"; : > "$dir/browser-endpoints.env"
  chmod 600 "$dir"/*
  printf '%s\n' "$dir"
}
write_host() { atomic_write "$1" host host "$2" "$3"; }
write_container() { atomic_write "$1" container container "$2" "$3"; }
write_host_set() { atomic_write "$1" host host "${@:2}"; }
write_container_set() { atomic_write "$1" container container "${@:2}"; }
write_browser_endpoints() { atomic_write "$1" browser-endpoints host "${@:2}"; }
atomic_write_raw() {
  local dir="$1" name="$2"; validate_dir "$dir"; shift 2
  local temp
  temp=$(mktemp "$dir/${name}.XXXXXX")
  cat > "$temp"
  chmod 600 "$temp"; mv "$temp" "$dir/${name}"
}
browser_config() {
  local dir="$1" issuer="$2"; validate_dir "$dir"; node "$script_dir/ci-runtime-endpoint-contract.mjs" host KEYCLOAK_PUBLIC_ISSUER_BASE "$issuer" || fail 'Browser Keycloak issuer must be manifest loopback URL'
  # Atomic tmp+mv: readers never observe a truncated runtime-config.js, and
  # the write happens between container create and start so single-file
  # bind mounts resolve the final inode.
  node -e 'process.stdout.write(`window.__PLEXICA_RUNTIME_CONFIG__=Object.freeze({apiBase:"",keycloakBase:${JSON.stringify(process.argv[1])}});\n`)' "$issuer" \
    | atomic_write_raw "$dir" runtime-config.js
}
export_host() {
  local dir="$1" stage="${2:-complete}" key
  validate_dir "$dir"
  # Same guard as the Keycloak credentials manifest: owned by this runner,
  # not a symlink, and mode 600 before its secrets are sourced.
  [[ -f "$dir/host.env" && -O "$dir/host.env" && ! -L "$dir/host.env" &&
    $(stat -c %a -- "$dir/host.env") == 600 ]] || fail 'Unsafe host manifest'
  # This manifest is written atomically by this script; consumers source only this host-only file.
  source "$dir/host.env"
  local keys=(POSTGRES_HOST_URL REDIS_HOST_URL MINIO_HOST_URL MINIO_ACCESS_KEY MINIO_SECRET_KEY LOKI_HOST_URL MAILPIT_SMTP_URL MAILPIT_UI_BASE KEYCLOAK_HOST_ADMIN_BASE KEYCLOAK_PUBLIC_ISSUER_BASE KEYCLOAK_ADMIN_USER KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_E2E_CLIENT_SECRET KAFKA_BROKERS PLUGIN_DB_SSL_MODE PLUGIN_DB_SSL_ROOT_CERT_PATH)
  [[ "$stage" == infra || "$stage" == complete ]] || fail 'Host manifest stage must be infra or complete'
  [[ "$stage" == infra ]] || keys+=(CORE_API_PUBLIC_BASE WEB_E2E_PUBLIC_BASE ADMIN_E2E_PUBLIC_BASE)
  for key in "${keys[@]}"; do
    [[ -n "${!key:-}" ]] || fail "Host manifest is missing $key"
    assert_host "$key" "${!key}"
  done
  for key in "${keys[@]}"; do printf 'export %s=%q\n' "$key" "${!key}"; done
  printf 'export DATABASE_URL=%q\nexport KEYCLOAK_URL=%q\nexport REDIS_URL=%q\nexport MINIO_ENDPOINT=%q\n' \
    "$POSTGRES_HOST_URL" "$KEYCLOAK_HOST_ADMIN_BASE" "$REDIS_HOST_URL" "$MINIO_HOST_URL"
}
assert_host() { node "$script_dir/ci-runtime-endpoint-contract.mjs" host "$1" "$2" || fail "Host consumer received invalid $1"; }
assert_container() { node "$script_dir/ci-runtime-endpoint-contract.mjs" container "$1" "$2" || fail "Container consumer received invalid $1"; }
case "${1:-}" in
  init) init "${2:-}" ;;
  write-host) write_host "${2:-}" "${3:-}" "${4:-}" ;;
  write-host-set) write_host_set "${2:-}" "${@:3}" ;;
  write-container) write_container "${2:-}" "${3:-}" "${4:-}" ;;
  write-container-set) write_container_set "${2:-}" "${@:3}" ;;
  write-browser-endpoints) write_browser_endpoints "${2:-}" "${@:3}" ;;
  browser-config) browser_config "${2:-}" "${3:-}" ;;
  assert-host) assert_host "${2:-}" "${3:-}" ;;
  assert-container) assert_container "${2:-}" "${3:-}" ;;
  export-host) export_host "${2:-}" "${3:-}" ;;
  *) fail 'Usage: ci-runtime-env.sh init|write-host|write-host-set|write-container|write-container-set|write-browser-endpoints|browser-config|export-host|assert-host|assert-container' ;;
esac
