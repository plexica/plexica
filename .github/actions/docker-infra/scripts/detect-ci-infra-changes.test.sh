#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/ci-test-env-guard.sh"

dir=$(cd -- "$(dirname -- "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
# The script derives its repo root from its OWN path (four levels up), so the
# fixture repo must mirror the real layout: script copied under
# <fixture-root>/.github/actions/docker-infra/scripts/.
mkdir -p "$tmp/.github/actions/docker-infra/scripts" "$tmp/.github/workflows" \
  "$tmp/apps/web/src" "$tmp/services/core-api/src/modules/plugin/services"
cp "$dir/detect-ci-infra-changes.sh" "$tmp/.github/actions/docker-infra/scripts/"
script="$tmp/.github/actions/docker-infra/scripts/detect-ci-infra-changes.sh"

git() { command git -C "$tmp" "$@"; }
git init -q
git config user.email test@example.com
git config user.name test
printf '1\n' > "$tmp/apps/web/src/foo.ts"
printf '1\n' > "$tmp/services/core-api/src/modules/plugin/services/proxy.service.ts"
git add -A && git commit -q -m init
base=$(git rev-parse HEAD)

heavy_of() {
  # Usage: heavy_of <event> [BASE_SHA] [HEAD_SHA] [BEFORE_SHA] [GITHUB_SHA]
  local event="$1" out
  out=$(mktemp)
  GITHUB_EVENT_NAME="$event" GITHUB_OUTPUT="$out" \
    BASE_SHA="${2:-}" HEAD_SHA="${3:-}" BEFORE_SHA="${4:-}" GITHUB_SHA="${5:-}" \
    bash "$script" >/dev/null
  grep -o 'heavy=.*' "$out"; rm -f "$out"
}
assert() { [[ "$1" == "$2" ]] || { echo "FAIL: $3 (expected $2, got $1)" >&2; exit 1; }; }

# Application-only change -> confident heavy=false.
printf '2\n' > "$tmp/apps/web/src/foo.ts"
git add -A && git commit -q -m "app change"
head1=$(git rev-parse HEAD)
assert "$(heavy_of pull_request "$base" "$head1")" heavy=false 'app-only PR diff must not be heavy'

# Workflow file change -> heavy=true.
mkdir -p "$tmp/.github/workflows"; printf '1\n' > "$tmp/.github/workflows/x.yml"
git add -A && git commit -q -m "workflow change"
head2=$(git rev-parse HEAD)
assert "$(heavy_of pull_request "$head1" "$head2")" heavy=true 'a .github/** change must be heavy'

# Manual dispatch is always heavy, independent of any diff.
assert "$(heavy_of workflow_dispatch)" heavy=true 'workflow_dispatch must always be heavy'

# Push with an all-zero before-SHA (new branch) fails open.
assert "$(heavy_of push '' '' 0000000000000000000000000000000000000000 "$head2")" heavy=true \
  'an all-zero push before-SHA must fail open to heavy'

# Normal push, application-only change -> confident heavy=false.
printf '3\n' > "$tmp/apps/web/src/foo.ts"
git add -A && git commit -q -m "push app change"
head3=$(git rev-parse HEAD)
assert "$(heavy_of push '' '' "$head2" "$head3")" heavy=false 'app-only push diff must not be heavy'

# Unrecognized event fails open.
assert "$(heavy_of schedule)" heavy=true 'an unrecognized event must fail open to heavy'

# A plugin runtime-identity file is heavy.
printf '2\n' > "$tmp/services/core-api/src/modules/plugin/services/proxy.service.ts"
git add -A && git commit -q -m "tier2 change"
head4=$(git rev-parse HEAD)
assert "$(heavy_of pull_request "$head3" "$head4")" heavy=true 'a plugin sidecar identity change must be heavy'

# Every remaining is_heavy_path() branch independently trips heavy=true
# (regression guard: an earlier version of this test exercised only 2 of 16
# branches, silently permitting the other 14 to bit-rot — a typo'd/renamed
# path there would exempt a real CI-infrastructure change from the heavy
# contract forever without any test ever failing). Includes the Keycloak/
# auth and same-origin apiBase boundary files (plan.md section 6, CI-PORT-04
# and CI-PORT-06) added symmetrically with the plugin sidecar files below.
heavy_paths=(
  docker-compose.yml docker-compose.ci.yml
  infra/compose/x.yml infra/docker/x.yml
  apps/web/playwright.config.ts apps/admin/playwright.config.ts
  apps/web/e2e/ci-runtime-contract.spec.ts apps/admin/e2e/ci-runtime-contract.spec.ts
  services/core-api/src/modules/plugin/services/plugin-container-identity.ts
  services/core-api/src/modules/plugin/services/docker-runtime-options.ts
  services/core-api/src/modules/plugin/services/container-manager.service.ts
  services/core-api/src/modules/plugin/services/docker-container-restart.ts
  services/core-api/src/modules/plugin/services/runtime-recovery.service.ts
  services/core-api/src/lib/config.ts
  services/core-api/src/middleware/auth-middleware.ts
  services/core-api/src/middleware/jwks-cache.ts
  services/core-api/src/lib/keycloak-admin-internal.ts
  services/core-api/src/modules/admin/services/health-check-keycloak.ts
  apps/web/src/lib/runtime-endpoints.ts apps/admin/src/lib/runtime-endpoints.ts
  apps/web/src/services/api-client.ts apps/admin/src/services/api-client.ts
  apps/web/src/services/keycloak-auth.ts apps/admin/src/services/keycloak-auth.ts
)
prior=$head4
for path in "${heavy_paths[@]}"; do
  mkdir -p "$tmp/$(dirname -- "$path")"; printf 'x\n' > "$tmp/$path"
  git add -A && git commit -q -m "touch $path"
  next=$(git rev-parse HEAD)
  assert "$(heavy_of pull_request "$prior" "$next")" heavy=true "a change under $path must be heavy"
  prior=$next
done
head5=$prior

# The root e2e/** wildcard (distinct from apps/*/e2e/**, already covered
# above by the contract-spec entries).
mkdir -p "$tmp/e2e"; printf 'x\n' > "$tmp/e2e/harness.ts"
git add -A && git commit -q -m "root e2e harness change"
head6=$(git rev-parse HEAD)
assert "$(heavy_of pull_request "$head5" "$head6")" heavy=true 'a root e2e/** change must be heavy'

# A non-ASCII path is not C-quoted out of is_heavy_path() matching
# (regression guard for the core.quotePath=false fix — a real reviewer
# finding: git's default quoting would otherwise emit
# `"e2e/r\303\251sum\303\251.spec.ts"`, which no literal pattern can match).
printf 'x\n' > "$tmp/e2e/résumé.spec.ts"
git add -A && git commit -q -m "unicode path"
head7=$(git rev-parse HEAD)
assert "$(heavy_of pull_request "$head6" "$head7")" heavy=true 'a non-ASCII e2e/** path must still be heavy'

# A malformed SHA fails open regardless of any real diff.
assert "$(heavy_of pull_request notasha "$head7")" heavy=true 'a malformed base SHA must fail open to heavy'

# A real diff command failure (unresolvable SHA) fails open.
assert "$(heavy_of pull_request "$(printf 'f%.0s' {1..40})" "$head7")" heavy=true \
  'an unresolvable (but well-formed) SHA must fail open to heavy'

echo 'detect-ci-infra-changes.test.sh: all cases passed'
