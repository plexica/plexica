#!/usr/bin/env bash
set -euo pipefail

# CI-PORT-13 single-project fallback: whenever ci-runtime-contract is skipped
# (see .github/workflows/ci.yml), this runs the SAME full web/admin Playwright
# suite (contract spec included) against the single project `ci` already
# bootstraps, so every trigger keeps real E2E coverage (Constitution Rule 1)
# without the doubled two-project environment. Pure reuse: does not modify
# ci-runtime-e2e-suite.sh or verify-concurrent-ci-runtime.sh, and mirrors the
# exact tail of that script's bootstrap() function.
project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
root=$(git rev-parse --show-toplevel)
scripts=${CI_RUNTIME_SCRIPTS_DIR:-"$root/.github/actions/docker-infra/scripts"}
export CI_RUNTIME_CONTRACT=1
export PLAYWRIGHT_BROWSER_CHANNEL=${PLAYWRIGHT_BROWSER_CHANNEL:-chrome}

# The contract postgres serves TLS signed by the admission-provisioned E2E CA
# (plugin sidecars connect with sslmode=verify-full); without it the suite
# would exercise a stack that cannot host plugin database traffic. Same
# precondition verify-concurrent-ci-runtime.sh enforces before its bootstrap.
[[ -n ${E2E_POSTGRES_TLS_SOURCE:-} && -f ${E2E_POSTGRES_TLS_SOURCE}/ca.crt ]] || {
  echo 'E2E_POSTGRES_TLS_SOURCE must point at the admission-provisioned CA directory' >&2; exit 1;
}

# Per-app suite orchestration (run_global_setup, run_playwright) lives in the
# sourced helper shared with the two-project contract verifier; it expects
# $scripts and $RUNNER_TEMP in scope (both already are: RUNNER_TEMP is a
# native GitHub Actions job environment variable).
source "$scripts/ci-runtime-e2e-suite.sh"

# CI-PORT-05 proof, mirrored from bootstrap(): the manifest KAFKA_BROKERS
# entry carries the dynamic Redpanda external-listener mapping this project's
# start-services.sh/wait-services.sh already resolved and released; without
# an active produce/consume round trip here, this fallback would silently
# skip verifying the one property CI-PORT-05 exists to prove.
export CI_RUNTIME_DIR="$runtime"; source "$scripts/source-ci-runtime-host.sh"
CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$scripts/ensure-topics.sh"
pnpm --filter core-api exec node scripts/verify-kafka-roundtrip.mjs "$KAFKA_BROKERS" "$project"

# Module Federation plugin assets: the two-project contract's bootstrap()
# publishes these before seeding either app. The single-project `ci` job
# never has, because until now nothing in `ci` ran Playwright against it.
# Without this, every plugin-system spec fails with a missing remoteEntry.js.
CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$scripts/publish-plugin-assets.sh"

run_global_setup "$project" web
run_global_setup "$project" admin
run_playwright "$project" web e2e/ci-runtime-contract.spec.ts
run_playwright "$project" @plexica/admin e2e/ci-runtime-contract.spec.ts
run_playwright "$project" web ''
run_playwright "$project" @plexica/admin ''
