#!/usr/bin/env bash
set -euo pipefail

# Contract tests for the port gates in verify-concurrent-port-gates.sh,
# extracted from the concurrent-verifier self-test to keep both under the
# 200-line constitution cap.

dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
asserts="$temp/port-asserts.sh"
for fn in assert_manifest_does_not_reuse_ports assert_no_legacy_fixed_ports; do
  awk "/^${fn}\(\)/,/^}/" "$dir/verify-concurrent-port-gates.sh" >> "$asserts"
done
sentinel="$temp/port-sentinel.txt"; printf 'web-e2e container-a 3000:3010/tcp\n' > "$sentinel"
printf 'CORE_API_PUBLIC_BASE=http://127.0.0.1:30001\n' > "$temp/host-near-miss.env"
printf 'CORE_API_PUBLIC_BASE=http://127.0.0.1:3000\n' > "$temp/host-reuse.env"
printf 'KEYCLOAK_ADMIN_USER=ci-admin-user-3000\nKEYCLOAK_ADMIN_PASSWORD=b3000z_AAAAAAAA\nKEYCLOAK_E2E_CLIENT_SECRET=KAFKA_BROKERS-digits-32000\n' > "$temp/host-hostile-credentials.env"
root="$temp"
if ( source "$asserts"; assert_manifest_does_not_reuse_ports "$sentinel" "$temp/host-near-miss.env" ) \
  && ! ( source "$asserts"; assert_manifest_does_not_reuse_ports "$sentinel" "$temp/host-reuse.env" ) \
  && ( source "$asserts"; assert_manifest_does_not_reuse_ports "$sentinel" "$temp/host-hostile-credentials.env" ); then :; else
  echo 'Manifest port assertion fails the near-miss contract' >&2; exit 1
fi
mkdir -p "$temp/infra/compose"
printf 'ports:\n  - "127.0.0.1:30001:30001"\n' > "$temp/docker-compose.ci.yml"
cp "$temp/docker-compose.ci.yml" "$temp/infra/compose/docker-compose.ci-runtime-services.yml"
if ( source "$asserts"; root="$temp"; assert_no_legacy_fixed_ports ); then printf 'ports:\n  - "127.0.0.1:3000:3000"\n' > "$temp/docker-compose.ci.yml"; else
  echo 'Legacy port assertion flags a near-miss port' >&2; exit 1
fi
if ( source "$asserts"; root="$temp"; assert_no_legacy_fixed_ports ); then
  echo 'Legacy port assertion misses an exact legacy fixed port' >&2; exit 1
fi
