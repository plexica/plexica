#!/usr/bin/env bash
set -euo pipefail

# verify-concurrent-port-gates.sh — port-sentinel snapshot and isolation
# assertions shared by verify-concurrent-ci-runtime.sh. Sourced, not executed:
# callers provide `root`, `compose` and the docker environment.

snapshot() {
  local project="$1" file="$2" service id port
  : > "$file"
  for service in postgres keycloak redpanda core-api-e2e web-e2e admin-e2e; do
    id=$(compose "$project" ps -q "$service")
    [[ -n "$id" ]] || { echo "Missing $service for $project" >&2; exit 1; }
    port=$(docker inspect --format '{{range $p, $v := .NetworkSettings.Ports}}{{range $v}}{{.HostPort}}:{{$p}} {{end}}{{end}}' "$id")
    printf '%s %s %s\n' "$service" "$id" "$port" >> "$file"
  done
  docker network ls --filter "label=com.docker.compose.project=$project" --format '{{.ID}} {{.Name}}' >> "$file"
  docker volume ls --filter "label=com.docker.compose.project=$project" --format '{{.Name}}' >> "$file"
}

assert_disjoint_ports() {
  local first="$1" second="$2" service id ports port
  declare -A first_ports=()
  while read -r service id ports; do
    for port in $ports; do [[ "$port" =~ ^[1-9][0-9]*: ]] && first_ports["${port%%:*}"]=1; done
  done < "$first"
  while read -r service id ports; do
    for port in $ports; do
      [[ "$port" =~ ^[1-9][0-9]*: ]] || continue
      [[ -z "${first_ports[${port%%:*}]:-}" ]] || { echo "Projects share inspected host port ${port%%:*}" >&2; exit 1; }
    done
  done < "$second"
}

assert_manifest_does_not_reuse_ports() {
  local sentinel="$1" manifest="$2" service id ports port
  [[ -f "$manifest" ]] || { echo 'Missing host manifest for port reuse check' >&2; exit 1; }
  while read -r service id ports; do
    for port in $ports; do
      [[ "$port" =~ ^[1-9][0-9]*: ]] || continue
      if grep -Eq "^[A-Z0-9_]+(_URL|_BASE|_BROKERS)=.*127\\.0\\.0\\.1:${port%%:*}([^0-9]|$)" "$manifest"; then
        echo "B host manifest reuses A inspected port ${port%%:*}" >&2; exit 1;
      fi
    done
  done < "$sentinel"
}

assert_no_legacy_fixed_ports() {
  local file content port pattern
  for file in "$root/docker-compose.ci.yml" "$root/infra/compose/docker-compose.ci-runtime-services.yml"; do
    content=$(<"$file")
    for port in 1025 3000 3001 3002 3100 5432 6379 8025 8080 9000 9001 9644 19092; do
      pattern="127\.0\.0\.1:${port}([^0-9]|$)"
      [[ ! "$content" =~ $pattern ]] || {
        echo "CI overlay retains legacy fixed host port ${port}" >&2; exit 1;
      }
    done
    [[ "$content" != *'--host 0.0.0.0'* ]] || {
      echo "CI overlay duplicates the vite-config host binding via CLI flags: ${file}" >&2; exit 1;
    }
  done
}
