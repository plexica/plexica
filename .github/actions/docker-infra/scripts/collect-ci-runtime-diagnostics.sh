#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
validate_ci_runtime "$project" "$runtime"
output="$runtime/diagnostics"
umask 077; mkdir -p "$output"; chmod 700 "$output"
selector=(--filter "label=com.docker.compose.project=$project")
scope=$(bash "$script_dir/ci-runtime-scope.sh" "$project")
plugin_selector=(--filter "label=io.plexica.runtime-scope=$scope")
mapfile -t containers < <({ docker ps -aq "${selector[@]}"; docker ps -aq "${plugin_selector[@]}"; } | sort -u)
for id in "${containers[@]}"; do
  labels=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "io.plexica.runtime-scope"}} {{index .Config.Labels "io.plexica.installation"}}' "$id")
  read -r owner actual_scope install_id <<< "$labels"
  if [[ -n "$install_id" ]]; then
    network=$(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}' "$id")
    expected_name="plexica-plugin-${scope}-$(printf '%s' "$install_id" | sha256sum | cut -c1-16)"
    name=$(docker inspect --format '{{.Name}}' "$id")
    [[ "$owner" == "$project" && "$actual_scope" == "$scope" && "$install_id" =~ ^[0-9a-fA-F-]{36}$ && "$network" == "${project}_default" && "$name" == "/$expected_name" ]] || {
      echo 'Refusing foreign plugin sidecar selection' >&2; exit 1;
    }
  elif [[ "$owner" != "$project" ]]; then
    echo 'Refusing foreign container selection' >&2; exit 1;
  fi
done
docker ps -a "${selector[@]}" --format '{{.ID}} {{.Names}} {{.Status}}' > "$output/ps.txt"
docker ps -a "${plugin_selector[@]}" --format '{{.ID}} {{.Names}} {{.Status}}' >> "$output/ps.txt"
node "$script_dir/sanitize-ci-runtime-diagnostics.mjs" "$runtime/container.env" "$runtime/host.env" \
  < "$runtime/host.env" > "$output/endpoints.txt"
if [[ -f "$runtime/prior-port-sentinel.txt" ]]; then
  node "$script_dir/sanitize-ci-runtime-diagnostics.mjs" "$runtime/container.env" "$runtime/host.env" \
    < "$runtime/prior-port-sentinel.txt" > "$output/port-sentinel.txt"
else
  for id in "${containers[@]}"; do
    docker inspect --format '{{.Id}} {{.Name}} {{json .NetworkSettings.Ports}}' "$id"
  done | node "$script_dir/sanitize-ci-runtime-diagnostics.mjs" "$runtime/container.env" "$runtime/host.env" \
    > "$output/port-sentinel.txt"
fi
docker events --since 1h --until now "${selector[@]}" |
  node "$script_dir/sanitize-ci-runtime-diagnostics.mjs" "$runtime/container.env" "$runtime/host.env" > "$output/events.txt"
for id in "${containers[@]}"; do
  docker logs --tail 200 "$id" 2>&1 |
    node "$script_dir/sanitize-ci-runtime-diagnostics.mjs" "$runtime/container.env" "$runtime/host.env" >> "$output/logs.txt"
done
[[ -f "$runtime/admission.env" ]] && cp "$runtime/admission.env" "$output/admission.env"
node "$script_dir/scan-ci-runtime-diagnostics.mjs" "$output" "$runtime/container.env" "$runtime/host.env"
for file in "$output"/*; do
  [[ -f "$file" && -O "$file" && ! -L "$file" ]] || { echo 'Unsafe diagnostic artifact' >&2; exit 1; }
  chmod 600 "$file"
done
