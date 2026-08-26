#!/usr/bin/env bash
set -euo pipefail

# CI-PORT-13: decides whether the current trigger must run the heavyweight
# two-project ci-runtime-contract job, or may safely skip it. Fail-open: any
# diff ambiguity, unresolved SHA, or unrecognized event forces heavy=true. A
# CONFIDENT diff against a recognized event that touches none of the fixed
# CI-infrastructure paths below is the only way to produce heavy=false — an
# unmatched path is a normal, confident "not heavy" classification, not an
# ambiguous one (see ADR-031 2026-08-26 revision).
#
# Required env: GITHUB_EVENT_NAME, GITHUB_OUTPUT (both native to every GitHub
# Actions step). pull_request additionally needs BASE_SHA/HEAD_SHA
# (github.event.pull_request.base/head.sha); push additionally needs
# GITHUB_SHA (native) and BEFORE_SHA (github.event.before).
#
# The three required-env reads below have no explicit fail-open guard of
# their own (a failure here aborts via `set -e` before any `emit`, so
# $GITHUB_OUTPUT never receives a `heavy=` line). This is intentionally safe
# by a second, independent layer: ci.yml's `if:` on ci-runtime-contract also
# fails open whenever this job's OWN result is not 'success' — including a
# hard crash here — so the heavy contract still runs. Do not remove that
# job-level clause without adding an equivalent guard in this script.
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)
event=${GITHUB_EVENT_NAME:?GITHUB_EVENT_NAME is required}
output=${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}

emit() {
  printf 'heavy=%s\n' "$1" >> "$output"
  printf 'detect-ci-infra-changes: heavy=%s (%s)\n' "$1" "$2"
  exit 0
}

is_full_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }
is_zero_sha() { [[ "$1" =~ ^0{40}$ ]]; }

# Fixed CI-infrastructure path set (CI-PORT-13): CI orchestration itself,
# plus application code that implements an isolation/security BOUNDARY the
# two-project contract specifically proves (plugin sidecar scope/network per
# CI-PORT-07, and the public-issuer/container-DNS Keycloak split per
# CI-PORT-06 and the same-origin apiBase split per CI-PORT-04 — see plan.md
# section 6). Wildcard directory groups (`dir/*`) are resilient to renames of
# files INSIDE the directory; exact single-file entries are not — review this
# list whenever ADR-031 or plan.md section 6 changes.
is_heavy_path() {
  case "$1" in
    .github/*| \
    docker-compose.yml|docker-compose.ci.yml| \
    infra/compose/*|infra/docker/*| \
    e2e/*| \
    apps/web/playwright.config.ts|apps/admin/playwright.config.ts| \
    apps/web/e2e/ci-runtime-contract.spec.ts|apps/admin/e2e/ci-runtime-contract.spec.ts| \
    services/core-api/src/modules/plugin/services/plugin-container-identity.ts| \
    services/core-api/src/modules/plugin/services/docker-runtime-options.ts| \
    services/core-api/src/modules/plugin/services/container-manager.service.ts| \
    services/core-api/src/modules/plugin/services/docker-container-restart.ts| \
    services/core-api/src/modules/plugin/services/runtime-recovery.service.ts| \
    services/core-api/src/modules/plugin/services/proxy.service.ts| \
    services/core-api/src/lib/config.ts| \
    services/core-api/src/middleware/auth-middleware.ts| \
    services/core-api/src/middleware/jwks-cache.ts| \
    services/core-api/src/lib/keycloak-admin-internal.ts| \
    services/core-api/src/modules/admin/services/health-check-keycloak.ts| \
    apps/web/src/lib/runtime-endpoints.ts|apps/admin/src/lib/runtime-endpoints.ts| \
    apps/web/src/services/api-client.ts|apps/admin/src/services/api-client.ts| \
    apps/web/src/services/keycloak-auth.ts|apps/admin/src/services/keycloak-auth.ts)
      return 0 ;;
    *) return 1 ;;
  esac
}

changed=''
# core.quotePath=false: git's default C-style quoting of non-ASCII/special
# path bytes (e.g. `"e2e/r\303\251sum\303\251.spec.ts"`) would never match the
# literal patterns in is_heavy_path(), silently classifying a real
# CI-infrastructure change as heavy=false. Disabling it keeps --name-only
# output as literal UTF-8 paths.
case "$event" in
  workflow_dispatch)
    emit true 'manual dispatch always runs the full contract' ;;
  pull_request)
    base=${BASE_SHA:-}; head=${HEAD_SHA:-}
    if ! is_full_sha "$base" || ! is_full_sha "$head"; then
      emit true 'pull_request base/head SHA missing or malformed'
    fi
    changed=$(cd "$root" && git -c core.quotePath=false diff --no-renames --name-only "$base...$head") ||
      emit true 'git diff against the PR merge-base failed' ;;
  push)
    before=${BEFORE_SHA:-}; after=${GITHUB_SHA:-}
    if ! is_full_sha "$before" || ! is_full_sha "$after"; then
      emit true 'push before/after SHA missing or malformed'
    fi
    if is_zero_sha "$before"; then
      emit true 'push before-SHA is all-zero (new branch/ref)'
    fi
    changed=$(cd "$root" && git -c core.quotePath=false diff --no-renames --name-only "$before" "$after") ||
      emit true 'git diff against the previous push SHA failed' ;;
  *)
    emit true "unrecognized event $event" ;;
esac

while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  is_heavy_path "$path" && emit true "changed path matches the CI-infrastructure set: $path"
done <<< "$changed"

emit false 'no changed path matches the CI-infrastructure set'
