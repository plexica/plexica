#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
validate_ci_runtime "$project" "$runtime"
output="$runtime/diagnostics"
umask 077; mkdir -p "$output"; chmod 700 "$output"
scope=$(bash "$script_dir/ci-runtime-scope.sh" "$project")
selector=(--filter "label=com.docker.compose.project=$project" --filter "label=io.plexica.runtime-scope=$scope")
# Plugin sidecars are created by Dockerode with only the Plexica scope label.
plugin_selector=(--filter "label=io.plexica.runtime-scope=$scope")
mapfile -t containers < <({ docker ps -aq "${selector[@]}"; docker ps -aq "${plugin_selector[@]}"; } | sort -u)
for id in "${containers[@]}"; do
  # Sidecar ownership is proven by the explicit io.plexica.runtime-project
  # label stamped by the proxy payload path; compose-managed resources keep
  # requiring the Compose project label. Comma delimiters (not spaces) keep
  # empty label fields positionally intact through read.
  labels=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}},{{index .Config.Labels "io.plexica.runtime-project"}},{{index .Config.Labels "io.plexica.runtime-scope"}},{{index .Config.Labels "io.plexica.installation"}}' "$id")
  IFS=, read -r owner runtime_owner actual_scope install_id <<< "$labels"
  if [[ -n "$install_id" ]]; then
    owner=$runtime_owner
    network=$(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}' "$id")
    expected_name="plexica-plugin-${scope}-$(printf '%s' "$install_id" | sha256sum | cut -c1-16)"
    name=$(docker inspect --format '{{.Name}}' "$id")
    [[ "$owner" == "$project" && "$actual_scope" == "$scope" && "$install_id" =~ ^[0-9a-fA-F-]{36}$ && "$network" == "${project}_default" && "$name" == "/$expected_name" ]] || {
      echo 'Refusing foreign plugin sidecar selection' >&2; exit 1;
    }
  elif [[ "$owner" != "$project" || "$actual_scope" != "$scope" ]]; then
    # A forged com.docker.compose.project label alone proves nothing: every
    # selected container must also carry this project's runtime-scope label.
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
# Docker's time parser accepts Unix/RFC3339 timestamps or Go durations but
# NOT the bare word "now" ("failed to parse value as time or duration"),
# so the upper bound must be a concrete UTC timestamp.
docker events --since 1h --until "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "${selector[@]}" |
  node "$script_dir/sanitize-ci-runtime-diagnostics.mjs" "$runtime/container.env" "$runtime/host.env" > "$output/events.txt"
# Container logs are captured into a private temp file FIRST: merging stderr
# with `2>&1 |` straight into the sanitizer can leak raw container output to
# the job log if the pipeline dies mid-stream. Unsanitized bytes only ever
# touch the temp file (mode 600 via umask) and are always removed.
for id in "${containers[@]}"; do
  raw=$(mktemp "$output/logs.raw.XXXXXX")
  if ! docker logs --tail 200 "$id" >"$raw" 2>&1; then
    rm -f "$raw"; exit 1
  fi
  if ! node "$script_dir/sanitize-ci-runtime-diagnostics.mjs" "$runtime/container.env" "$runtime/host.env" \
    < "$raw" >> "$output/logs.txt"; then
    rm -f "$raw"; exit 1
  fi
  rm -f "$raw"
done
[[ -f "$runtime/admission.env" ]] && cp "$runtime/admission.env" "$output/admission.env"
node "$script_dir/scan-ci-runtime-diagnostics.mjs" "$output" "$runtime/container.env" "$runtime/host.env"
for file in "$output"/*; do
  [[ -f "$file" && -O "$file" && ! -L "$file" ]] || { echo 'Unsafe diagnostic artifact' >&2; exit 1; }
  chmod 600 "$file"
done
