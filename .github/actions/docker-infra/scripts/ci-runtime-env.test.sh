#!/usr/bin/env bash
set -euo pipefail

temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
export RUNNER_TEMP="$temp"
script="$(dirname "$0")/ci-runtime-env.sh"
path_helper="$(dirname "$script")/ci-runtime-path.sh"
dir=$(bash "$script" init plexica-ci-contract-123456)
[[ $(stat -c %a "$dir") == 700 && $(stat -c %a "$dir/host.env") == 600 ]]
# The CI overlay resolves env_file eagerly at compose load time, so init must pre-create
# sidecar-images.env before any compose invocation; publication overwrites it later.
[[ -f "$dir/sidecar-images.env" && ! -s "$dir/sidecar-images.env" && $(stat -c %a "$dir/sidecar-images.env") == 600 ]]
# The overlay also resolves browser-endpoints.env eagerly; init must pre-create it too.
[[ -f "$dir/browser-endpoints.env" && ! -s "$dir/browser-endpoints.env" && $(stat -c %a "$dir/browser-endpoints.env") == 600 ]]
bash "$script" write-host "$dir" KEYCLOAK_HOST_ADMIN_BASE http://127.0.0.1:32000
bash "$script" write-host "$dir" POSTGRES_HOST_URL postgresql://plexica:changeme@127.0.0.1:32001/plexica
bash "$script" write-host "$dir" REDIS_HOST_URL redis://127.0.0.1:32002
bash "$script" write-host "$dir" MINIO_HOST_URL http://127.0.0.1:32003
bash "$script" write-host "$dir" LOKI_HOST_URL http://127.0.0.1:32008
bash "$script" write-host "$dir" MAILPIT_SMTP_URL smtp://127.0.0.1:32009
bash "$script" write-host "$dir" MAILPIT_UI_BASE http://127.0.0.1:32010
bash "$script" write-host "$dir" KEYCLOAK_PUBLIC_ISSUER_BASE http://127.0.0.1:32000
bash "$script" write-host "$dir" KEYCLOAK_ADMIN_USER ci-admin-0123456789abcdef
bash "$script" write-host "$dir" KEYCLOAK_ADMIN_PASSWORD AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
bash "$script" write-host "$dir" KEYCLOAK_E2E_CLIENT_SECRET AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
bash "$script" write-host "$dir" KAFKA_BROKERS 127.0.0.1:32004
bash "$script" write-host "$dir" CORE_API_PUBLIC_BASE http://127.0.0.1:32005
bash "$script" write-host "$dir" WEB_E2E_PUBLIC_BASE http://127.0.0.1:32006
bash "$script" write-host "$dir" ADMIN_E2E_PUBLIC_BASE http://127.0.0.1:32007
bash "$script" write-container "$dir" KEYCLOAK_URL http://keycloak:8080
bash "$script" write-container "$dir" PLUGIN_CORE_API_URL http://core-api-e2e:3001
bash "$script" write-container "$dir" EVENT_KEY_ENCRYPTION_KEY AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
bash "$script" write-container "$dir" PLUGIN_DB_ENCRYPTION_KEY aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
bash "$script" write-container "$dir" PLUGIN_CREDENTIAL_PEPPER 0123456789abcdef0123456789abcdef
bash "$script" browser-config "$dir" http://127.0.0.1:32000
bash "$script" write-browser-endpoints "$dir" WEB_E2E_PUBLIC_BASE http://127.0.0.1:32006 ADMIN_E2E_PUBLIC_BASE http://127.0.0.1:32007 KEYCLOAK_PUBLIC_ISSUER_BASE http://127.0.0.1:32000
for entry in 'WEB_E2E_PUBLIC_BASE=http://127.0.0.1:32006' 'ADMIN_E2E_PUBLIC_BASE=http://127.0.0.1:32007' 'KEYCLOAK_PUBLIC_ISSUER_BASE=http://127.0.0.1:32000'; do
  grep -Fx "$entry" "$dir/browser-endpoints.env" >/dev/null || { echo "browser-endpoints.env is missing $entry" >&2; exit 1; }
done
if bash "$script" write-browser-endpoints "$dir" WEB_E2E_PUBLIC_BASE http://keycloak:8080; then
  echo 'browser endpoints writer accepted a non-loopback origin' >&2; exit 1
fi
grep -Fx 'WEB_E2E_PUBLIC_BASE=http://127.0.0.1:32006' "$dir/browser-endpoints.env" >/dev/null || {
  echo 'Rejected write mutated browser-endpoints.env' >&2; exit 1;
}
grep -F 'apiBase:""' "$dir/runtime-config.js" >/dev/null
if grep -Eq 'EVENT_KEY_ENCRYPTION_KEY|PLUGIN_DB_ENCRYPTION_KEY|PLUGIN_CREDENTIAL_PEPPER' "$dir/runtime-config.js"; then
  echo 'Browser runtime config exposed container secrets' >&2; exit 1
fi
if grep -Eq 'LOKI_HOST_URL|MAILPIT_(SMTP_URL|UI_BASE)' "$dir/runtime-config.js"; then
  echo 'Browser runtime config exposed runner-only observability endpoints' >&2; exit 1
fi
if bash "$script" write-container "$dir" BAD http://127.0.0.1:3001; then exit 1; fi
if bash "$script" write-host "$dir" BAD http://keycloak:8080; then exit 1; fi
if bash "$script" write-container "$dir" KEYCLOAK_HOST_ADMIN_BASE http://127.0.0.1:32000; then exit 1; fi
for bad in http://foreign:8080 http://127.0.0.1:8080 http://[::1]:8080; do
  if bash "$script" write-container "$dir" KEYCLOAK_URL "$bad"; then exit 1; fi
done
# Parsed-URL container contract: case-variant host-gateway aliases, raw IPv4/IPv6
# addresses, unspecified/loopback forms and bare localhost are all rejected.
for bad in http://HOST.DOCKER.INTERNAL:8080 http://host.docker.internal:8080 http://x.host.docker.internal:8080 \
  http://localhost http://localhost:8080 http://LOCALHOST:8080 http://0.0.0.0:8080 http://10.9.9.9:8080 \
  http://[::]:8080 http://[fe80::1]:8080 https://keycloak:8080 http://redis:8080; do
  if bash "$script" write-container "$dir" KEYCLOAK_URL "$bad"; then exit 1; fi
done
if bash "$script" write-container "$dir" PLUGIN_CORE_API_URL 'http://core-api-e2e.evil.test:3001'; then exit 1; fi
for bad in http://localhost:32000 http://[::1]:32000; do
  if bash "$script" write-host "$dir" KEYCLOAK_HOST_ADMIN_BASE "$bad"; then exit 1; fi
done
host_source="$(dirname "$script")/source-ci-runtime-host.sh"
environment=$(CI_RUNTIME_DIR="$dir" bash -c 'source "$1"; printf "%s|%s|%s|%s|%s" "$DATABASE_URL" "$KEYCLOAK_URL" "$REDIS_URL" "$MINIO_ENDPOINT" "$KAFKA_BROKERS"' _ "$host_source")
[[ "$environment" == 'postgresql://plexica:changeme@127.0.0.1:32001/plexica|http://127.0.0.1:32000|redis://127.0.0.1:32002|http://127.0.0.1:32003|127.0.0.1:32004' ]]
# export-host guard: like the Keycloak credentials manifest, host.env must be
# owner-only (mode 600) before its plaintext secrets are sourced.
chmod 644 "$dir/host.env"
if CI_RUNTIME_DIR="$dir" bash -c 'source "$0"' "$host_source" >/dev/null 2>&1; then
  echo 'Host manifest was sourced while group/world-readable' >&2; exit 1
fi
chmod 600 "$dir/host.env"
# Round-trip, shell kind: host.env is consumed by bash source only, so a value
# holding characters that literal parsers would mangle must survive %q
# encoding and decode byte-identically.
shell_hostile='sp ace-$x`q"#&|;'
before=$(grep -c . "$dir/host.env")
if bash "$script" write-host "$dir" KEYCLOAK_ADMIN_PASSWORD "$shell_hostile"; then
  ( source "$dir/host.env"
    [[ "$KEYCLOAK_ADMIN_PASSWORD" == "$shell_hostile" ]] || { echo 'Sourced host.env diverged from written value' >&2; exit 1; }
  ) || exit 1
else
  echo 'Host writer rejected an endpoint-contract-valid password' >&2; exit 1
fi
# Round-trip guard, env_file kind: container.env feeds Compose literal
# parsing, so a contract-valid but parser-hostile value must be rejected
# without mutating the file.
container_before=$(cat "$dir/container.env")
if bash "$script" write-container "$dir" KEYCLOAK_ADMIN_PASSWORD "$shell_hostile"; then
  echo 'Container writer accepted a value Compose env_file would mangle' >&2; exit 1
fi
[[ "$(cat "$dir/container.env")" == "$container_before" ]]
outside="$temp/outside"; mkdir "$outside"
link="$temp/plexica-ci/plexica-ci-link-123456"
if ln -s "$outside" "$link" && bash -c 'source "$1"; validate_ci_runtime "$2" "$3"' -- "$path_helper" plexica-ci-contract-123456 "$link"; then
  echo 'Accepted a symlinked runtime directory' >&2; exit 1
fi
foreign="$(bash "$script" init plexica-ci-foreign-123456)"
if bash -c 'source "$1"; validate_ci_runtime "$2" "$3"' -- "$path_helper" plexica-ci-contract-123456 "$foreign"; then
  echo 'Accepted a foreign runtime directory' >&2; exit 1
fi
if bash -c 'source "$1"; validate_ci_runtime "$2" "$3"' -- "$path_helper" plexica-ci-contract-123456 "$temp/plexica-ci/plexica-ci-contract-123456/../plexica-ci-foreign-123456"; then
  echo 'Accepted a traversing runtime path' >&2; exit 1
fi
chmod 755 "$dir"
if bash -c 'source "$1"; validate_ci_runtime "$2" "$3"' -- "$path_helper" plexica-ci-contract-123456 "$dir"; then
  echo 'Accepted an overly permissive runtime directory' >&2; exit 1
fi
chmod 700 "$dir"
chmod 755 "$temp/plexica-ci"
if bash -c 'source "$1"; validate_ci_runtime "$2" "$3"' -- "$path_helper" plexica-ci-contract-123456 "$dir"; then
  echo 'Accepted an overly permissive runtime root' >&2; exit 1
fi
chmod 700 "$temp/plexica-ci"
mkdir "$temp/stat-bin"
cat > "$temp/stat-bin/stat" <<'EOF'
#!/usr/bin/env bash
[[ "$*" == *'%u'* ]] && { printf '65534\n'; exit 0; }
exec /usr/bin/stat "$@"
EOF
chmod +x "$temp/stat-bin/stat"
if PATH="$temp/stat-bin:$PATH" bash -c 'source "$1"; validate_ci_runtime "$2" "$3"' -- "$path_helper" plexica-ci-contract-123456 "$dir"; then
  echo 'Accepted a foreign-owned runtime directory' >&2; exit 1
fi
if bash -c 'source "$1"; validate_ci_runtime "$2" "$3"' -- "$path_helper" plexica-ci-missing-123456 "$temp/plexica-ci/plexica-ci-missing-123456"; then
  echo 'Accepted a missing runtime directory' >&2; exit 1
fi
