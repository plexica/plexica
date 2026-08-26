#!/usr/bin/env bash
set -euo pipefail

# Mechanical extraction of the `ci` job's former "Test CI runtime contracts"
# inline step body (Rule 4 line-budget relief for ci.yml) — no behavior
# change. ci-test-env-guard.sh drops the job-scoped keys exported via
# GITHUB_ENV (admission, encryption material, infra credentials) before any
# contract runs; each test re-seeds its own. Sourced (not duplicated) so the
# 19 pre-existing *.test.sh files and this runner share one list.
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-test-env-guard.sh"
root=$(cd -- "$script_dir/../../../.." && pwd)
cd "$root"
node .github/actions/docker-infra/scripts/ci-runtime-endpoint-contract.test.mjs
node .github/actions/docker-infra/scripts/sanitize-ci-runtime-diagnostics.test.mjs
bash .github/actions/docker-infra/scripts/ci-runtime-env.test.sh
bash .github/actions/docker-infra/scripts/provision-e2e-postgres-ca.test.sh
bash .github/actions/docker-infra/scripts/ci-runtime-keycloak-credentials.test.sh
bash .github/actions/docker-infra/scripts/ci-runtime-compose.test.sh
bash .github/actions/docker-infra/scripts/ci-runtime-cleanup.test.sh
bash .github/actions/docker-infra/scripts/ensure-topics.test.sh
bash .github/actions/docker-infra/scripts/keycloak-contract.test.sh
bash .github/actions/docker-infra/scripts/redpanda-contract.test.sh
bash .github/actions/docker-infra/scripts/verify-ci-runtime-artifacts.test.sh
bash .github/actions/docker-infra/scripts/verify-ci-runner-capacity.test.sh
node .github/actions/docker-infra/scripts/ci-workflow-contract.test.mjs
node .github/actions/docker-infra/scripts/ci-workflow-credentials.test.mjs
bash .github/actions/docker-infra/scripts/ci-runtime-lifecycle.test.sh
bash .github/actions/docker-infra/scripts/verify-ci-sidecar-lifecycle.test.sh
bash .github/actions/docker-infra/scripts/verify-ci-compose-render.test.sh
bash .github/actions/docker-infra/scripts/wait-services.test.sh
bash .github/actions/docker-infra/scripts/wait-for-http.test.sh
bash .github/actions/docker-infra/scripts/down-ci-runtime-project.test.sh
bash .github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.test.sh
bash .github/actions/docker-infra/scripts/detect-ci-infra-changes.test.sh
bash .github/actions/docker-infra/scripts/run-single-project-e2e-suite.test.sh
bash .github/actions/docker-infra/scripts/generate-ci-runtime-secrets.test.sh
node infra/docker/ci-plugin-docker-proxy.test.mjs
