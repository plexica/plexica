#!/usr/bin/env bash
# shellcheck shell=bash
# Per-app E2E suite orchestration for the concurrent CI verifier:
#   - run_global_setup: canonical seeding via the app's own globalSetup entry
#   - run_playwright:   isolated headless invocation under that seeded state
# Sourced by verify-concurrent-ci-runtime.sh; expects $scripts, $RUNNER_TEMP,
# and $root to be set by the sourcer. Not executable standalone.

# Canonical seeding parity: invoke the app's existing globalSetup ONCE per
# project under the sourced host.env manifest values (run-e2e-global-setup.sh
# sources the manifest itself), replacing the previous duplicated bespoke
# provisioning. Per-project credentials stay independent: concurrent A/B
# bootstraps run in separate subshells against separate manifests.
run_global_setup() {
  local project="$1" app="$2"
  CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="${RUNNER_TEMP}/plexica-ci/$project" \
    bash "$scripts/run-e2e-global-setup.sh" "$app"
}

# Concurrent A/B bootstraps share one working tree, so every Playwright
# invocation must write into a per-project output root under its own runtime
# dir (cleaned up with the project teardown). Otherwise identical test titles
# clear and cross artifacts in the shared default test-results/ and
# playwright-report/ directories.
#
# The subshell scope matters twice over: the sourced per-app credential
# manifest must not leak across apps or projects, and full-suite invocations
# must carry the contract-spec exclusion flag (bootstrap already ran them once
# per app pre-teardown via the explicit invocation above).
run_playwright() {
  local project="$1" filter="$2" suite="$3" name out runtime setup_manifest
  runtime="${RUNNER_TEMP}/plexica-ci/$project"
  name=${filter##*/}
  out="$runtime/playwright/$name"
  mkdir -p "$out/test-results" "$out/report"
  case "$filter" in
    web) setup_manifest="$runtime/setup-web.env" ;;
    *) setup_manifest="$runtime/setup-admin.env" ;;
  esac
  (
    set -a; source "$setup_manifest"; set +a
    export CI_RUNTIME_CONTRACT=1 CI_RUNTIME_DIR="$runtime" PLAYWRIGHT_E2E=true \
      CI_RUNTIME_EXTERNAL_SETUP=1 PLAYWRIGHT_HTML_REPORT="$out/report"
    if [[ -z "$suite" ]]; then
      export CI_RUNTIME_SKIP_CONTRACT_SPEC=1
      pnpm --filter "$filter" exec playwright test --output "$out/test-results"
    else
      pnpm --filter "$filter" exec playwright test --output "$out/test-results" "$suite"
    fi
  )
}
