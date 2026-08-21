#!/usr/bin/env bash
set -euo pipefail

for script in start-services.sh wait-services.sh verify-health.sh; do
  grep -F 'CI_COMPOSE_PROJECT' "$(dirname "$0")/$script" >/dev/null
done
grep -F 'WEB_E2E_PUBLIC_BASE' "$(dirname "$0")/verify-health.sh" >/dev/null
