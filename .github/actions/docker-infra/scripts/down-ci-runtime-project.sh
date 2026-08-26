#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
root=$(cd -- "$script_dir/../../../.." && pwd)
validate_ci_runtime "$project" "$runtime"
scope=$(bash "$script_dir/ci-runtime-scope.sh" "$project")
export CI_RUNTIME_SCOPE="$scope"
resources=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
for id in $resources; do
  [[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id") == "$project" ]] || {
    echo 'Refusing foreign container selection' >&2; exit 1;
  }
done
sidecars=$(docker ps -aq --filter "label=io.plexica.runtime-scope=$scope")
for id in $sidecars; do
  # Plugin sidecars are created through the Docker control proxy and prove
  # ownership via the explicit io.plexica.runtime-project label stamped by
  # the identity/payload path (no compose-managed metadata required).
  # Compose-managed services also carry the scope label and keep proving
  # ownership via their Compose project label. Comma delimiters (not spaces)
  # keep empty label fields positionally intact.
  labels=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}},{{index .Config.Labels "io.plexica.runtime-project"}},{{index .Config.Labels "io.plexica.installation"}}' "$id")
  IFS=, read -r compose_owner owner install_id <<< "$labels"
  if [[ -n "$install_id" ]]; then
    network=$(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}' "$id")
    expected_name="plexica-plugin-${scope}-$(printf '%s' "$install_id" | sha256sum | cut -c1-16)"
    name=$(docker inspect --format '{{.Name}}' "$id")
    [[ "$owner" == "$project" && "$install_id" =~ ^[0-9a-fA-F-]{36}$ && "$network" == "${project}_default" && "$name" == "/$expected_name" ]] || {
      echo 'Refusing foreign plugin sidecar selection' >&2; exit 1;
    }
  elif [[ "$compose_owner" != "$project" ]]; then
    echo 'Refusing foreign container selection' >&2; exit 1;
  fi
done
# mapfile (not `read -a`): docker ps -aq emits one ID per line and read would
# only capture the first sidecar, leaking the rest on teardown. Feeding an
# EMPTY selection through a here-string would yield one empty element and
# `docker rm -f ''` fails ("container name cannot be empty") — a project whose
# runtime never started must tear down cleanly, so printf (no trailing
# newline on empty input) keeps the array truly zero-length.
mapfile -t sidecar_ids < <(printf '%s' "$sidecars")
(( ${#sidecar_ids[@]} == 0 )) || docker rm -f "${sidecar_ids[@]}"
mapfile -t _overlay_files < <(ci_compose_overlay_files "$root")
docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml" ${_overlay_files[@]/#/-f} down -v
validate_ci_runtime "$project" "$runtime"
chmod -R u+rwx,go-rwx -- "$runtime"
rm -rf --one-file-system -- "$runtime"
[[ ! -e "$runtime" ]] || { echo 'Runtime directory survived teardown' >&2; exit 1; }
