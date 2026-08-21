#!/usr/bin/env bash
set -euo pipefail

compose="$(git rev-parse --show-toplevel)/docker-compose.ci.yml"
runtime_fragment="$(dirname "$compose")/infra/compose/docker-compose.ci-runtime-services.yml"
dependabot="$(dirname "$compose")/.github/dependabot.yml"
grep -F '!override' "$compose" >/dev/null
grep -F './infra/compose/docker-compose.ci-runtime-services.yml' "$compose" >/dev/null
test -f "$runtime_fragment"
[[ $(basename "$runtime_fragment") =~ ^(docker-)?compose(-[[:alnum:]_]+)?\.[[:alnum:]_-]+\.ya?ml$ ]]
grep -F 'package-ecosystem: docker-compose' "$dependabot" >/dev/null
grep -F "directory: '/infra/compose'" "$dependabot" >/dev/null
test "$(grep -Fc 'image: node:24-bookworm@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584' "$runtime_fragment")" -eq 3
if grep -F './infra/compose/ci-runtime-services.yml' "$compose"; then exit 1; fi
for port in 5432 8080 6379 9000 19092; do grep -F "127.0.0.1::${port}" "$compose" >/dev/null; done
if grep -E '^name:|plexica-e2e' "$compose"; then exit 1; fi
