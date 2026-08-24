#!/usr/bin/env bash
set -euo pipefail

project=${1:?project is required}
[[ "$project" =~ ^plexica-ci-[a-z0-9][a-z0-9-]{5,43}$ ]] || { echo 'Invalid project' >&2; exit 1; }
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
[[ ${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required} == "$project" ]] || {
  echo 'Render project does not match CI runtime context' >&2; exit 1;
}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
validate_ci_runtime "$project" "$runtime"
version_at_least() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }
docker_version=$(docker version --format '{{.Server.Version}}')
compose_version=$(docker compose version --short)
version_at_least "$docker_version" 24.0.0 || { echo 'Docker >=24 is required' >&2; exit 1; }
version_at_least "$compose_version" 2.24.4 || { echo 'Compose >=2.24.4 is required' >&2; exit 1; }
root=$(cd -- "$script_dir/../../../.." && pwd)
grep -Eq '^name:' "$root/docker-compose.ci.yml" && { echo 'CI overlay contains a fixed project name' >&2; exit 1; }
# Regression guard: the overlay must render on a fresh runtime dir with NO
# post-discovery variable exported — their values arrive via the pre-created
# browser-endpoints.env env_file, populated by later lifecycle stages.
rendered=$(env -u WEB_E2E_PUBLIC_BASE -u ADMIN_E2E_PUBLIC_BASE -u KEYCLOAK_PUBLIC_ISSUER_BASE \
  CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml" config --format json)
node -e '
const config = JSON.parse(process.argv[1]);
for (const [service, value] of Object.entries(config.services)) {
  for (const port of value.ports ?? []) {
    if (port.host_ip !== "127.0.0.1" || (Object.hasOwn(port, "published") && port.published !== "")) {
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
}
const core = config.services["core-api-e2e"];
if (core.environment.NODE_ENV !== "production" || core.environment.KEYCLOAK_HOST_ADMIN_BASE !== undefined ||
    core.environment.KEYCLOAK_URL !== "http://keycloak:8080" ||
    core.environment.KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE !== "http://keycloak:8080") {
  throw new Error("Core CI environment is not production-safe and DNS-only");
}
if (core.environment.PLUGIN_DOCKER_HOST !== "http://plugin-docker-proxy:2375") {
  throw new Error("Core lacks the scoped plugin Docker control endpoint");
}
for (const service of ["core-api-e2e", "web-e2e", "admin-e2e"]) {
  const value = config.services[service];
  if (!String(value.image).startsWith("node:24-bookworm@sha256:") ||
      !String(value.command).includes("corepack enable") ||
      !String(value.command).includes("corepack prepare pnpm@10.33.0 --activate")) {
    throw new Error(`${service} does not activate the pinned project pnpm version`);
  }
}
const proxy = config.services["plugin-docker-proxy"];
if (proxy.ports?.length || proxy.networks?.default || !proxy.networks?.["plugin-docker-control"]?.aliases?.includes("plugin-docker-proxy")) {
  throw new Error("Plugin Docker control is publicly reachable");
}
if ((config.services["keycloak-init"].environment ?? {}).KEYCLOAK_WEB_ORIGIN !== undefined) {
  throw new Error("Keycloak CI render retained a static web origin instead of browser-endpoints.env");
}' "$rendered"
