#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
[[ "$project" =~ ^plexica-ci-[a-z0-9][a-z0-9-]{5,45}$ ]] || { echo 'Invalid project' >&2; exit 1; }
output="$runtime/diagnostics"; mkdir -p "$output"; chmod 700 "$output"
selector=(--filter "label=com.docker.compose.project=$project")
containers=$(docker ps -aq "${selector[@]}")
for id in $containers; do
  [[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id") == "$project" ]] || exit 1
done
docker ps -a "${selector[@]}" --format '{{.ID}} {{.Names}} {{.Status}}' > "$output/ps.txt"
docker events --since 1h --until now "${selector[@]}" > "$output/events.txt" || true
for id in $containers; do docker logs --tail 200 "$id" 2>&1 >> "$output/logs.txt" || true; done
cp "$runtime/admission.env" "$output/admission.env" 2>/dev/null || true
grep -R -E -i '(password|secret|token|pepper|encryption[_-]?key)=' "$output" && {
  echo 'Secret canary found in diagnostics' >&2; exit 1;
}
chmod 600 "$output"/* 2>/dev/null || true
