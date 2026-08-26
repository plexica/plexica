#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/ci-test-env-guard.sh"

dir=$(cd -- "$(dirname -- "$0")" && pwd)
script="$dir/generate-ci-runtime-secrets.sh"

base_out=$(bash "$script")
mapfile -t base_lines <<< "$base_out"
[[ ${#base_lines[@]} -eq 3 ]] || { echo "Expected exactly 3 base lines, got ${#base_lines[@]}" >&2; exit 1; }
for key in EVENT_KEY_ENCRYPTION_KEY PLUGIN_DB_ENCRYPTION_KEY PLUGIN_CREDENTIAL_PEPPER; do
  printf '%s\n' "${base_lines[@]}" | grep -q "^$key=" || { echo "Missing $key in base output" >&2; exit 1; }
done
for key in POSTGRES_PASSWORD MINIO_ACCESS_KEY MINIO_SECRET_KEY; do
  printf '%s\n' "${base_lines[@]}" | grep -q "^$key=" && { echo "Base output must not include $key" >&2; exit 1; }
done

full_out=$(bash "$script" --full)
mapfile -t full_lines <<< "$full_out"
[[ ${#full_lines[@]} -eq 6 ]] || { echo "Expected exactly 6 --full lines, got ${#full_lines[@]}" >&2; exit 1; }
for key in EVENT_KEY_ENCRYPTION_KEY PLUGIN_DB_ENCRYPTION_KEY PLUGIN_CREDENTIAL_PEPPER \
  POSTGRES_PASSWORD MINIO_ACCESS_KEY MINIO_SECRET_KEY; do
  printf '%s\n' "${full_lines[@]}" | grep -q "^$key=" || { echo "Missing $key in --full output" >&2; exit 1; }
done

# Every value must be freshly generated per invocation, never a fixed/default
# credential (Security §5): two runs must never agree on any value.
second_out=$(bash "$script" --full)
[[ "$full_out" != "$second_out" ]] || { echo 'Two invocations produced identical secrets' >&2; exit 1; }

value_of() { grep "^$2=" <<< "$1" | cut -d= -f2-; }
# openssl rand -hex 32 -> 64 lowercase hex chars; -hex 24 -> 48.
[[ "$(value_of "$full_out" PLUGIN_DB_ENCRYPTION_KEY)" =~ ^[0-9a-f]{64}$ ]] ||
  { echo 'PLUGIN_DB_ENCRYPTION_KEY is not a 32-byte hex value' >&2; exit 1; }
[[ "$(value_of "$full_out" POSTGRES_PASSWORD)" =~ ^[0-9a-f]{48}$ ]] ||
  { echo 'POSTGRES_PASSWORD is not a 24-byte hex value' >&2; exit 1; }
[[ "$(value_of "$full_out" MINIO_ACCESS_KEY)" =~ ^[0-9a-f]{48}$ ]] ||
  { echo 'MINIO_ACCESS_KEY is not a 24-byte hex value' >&2; exit 1; }
[[ "$(value_of "$full_out" MINIO_SECRET_KEY)" =~ ^[0-9a-f]{64}$ ]] ||
  { echo 'MINIO_SECRET_KEY is not a 32-byte hex value' >&2; exit 1; }
# base64url (openssl base64 + '+/' -> '-_', '=' stripped): no padding or
# standard-base64 characters may leak into a GITHUB_ENV-appended line.
for key in EVENT_KEY_ENCRYPTION_KEY PLUGIN_CREDENTIAL_PEPPER; do
  value=$(value_of "$full_out" "$key")
  [[ "$value" != *[+/=]* && -n "$value" ]] || { echo "$key is not base64url-safe: $value" >&2; exit 1; }
done

echo 'generate-ci-runtime-secrets.test.sh: all cases passed'
