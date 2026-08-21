#!/usr/bin/env bash
set -euo pipefail

project=${1:?project is required}
[[ "$project" =~ ^plexica-ci-[a-z0-9][a-z0-9-]{5,45}$ ]] || { echo 'Invalid project' >&2; exit 1; }
version_at_least() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }
docker_version=$(docker version --format '{{.Server.Version}}')
compose_version=$(docker compose version --short)
version_at_least "$docker_version" 24.0.0 || { echo 'Docker >=24 is required' >&2; exit 1; }
version_at_least "$compose_version" 2.24.4 || { echo 'Compose >=2.24.4 is required' >&2; exit 1; }
grep -Eq '^name:' docker-compose.ci.yml && { echo 'CI overlay contains a fixed project name' >&2; exit 1; }
rendered=$(docker compose --project-name "$project" -f docker-compose.yml -f docker-compose.ci.yml config --format json)
node -e '
const config = JSON.parse(process.argv[1]);
for (const [service, value] of Object.entries(config.services)) {
  for (const port of value.ports ?? []) {
    if (port.host_ip !== "127.0.0.1" || Object.hasOwn(port, "published")) {
      throw new Error(`${service} has a fixed or non-loopback publication`);
    }
  }
}
for (const [service, target] of [["postgres", 5432], ["keycloak", 8080], ["redpanda", 19092], ["core-api-e2e", 3001], ["web-e2e", 3000], ["admin-e2e", 3002]]) {
  if (!(config.services[service].ports ?? []).some((port) => port.target === target)) {
    throw new Error(`Missing dynamic mapping for ${service}:${target}`);
  }
}
if (JSON.stringify(config.services.redpanda.command).includes("localhost:19092")) {
  throw new Error("Redpanda fixed listener survived CI render");
}' "$rendered"
