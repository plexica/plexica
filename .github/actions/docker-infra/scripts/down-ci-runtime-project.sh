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
  labels=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "io.plexica.runtime-scope"}} {{index .Config.Labels "io.plexica.installation"}}' "$id")
  read -r owner actual_scope install_id <<< "$labels"
  network=$(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}' "$id")
  expected_name="plexica-plugin-${scope}-$(printf '%s' "$install_id" | sha256sum | cut -c1-16)"
  name=$(docker inspect --format '{{.Name}}' "$id")
  [[ "$owner" == "$project" && "$actual_scope" == "$scope" && "$install_id" =~ ^[0-9a-fA-F-]{36}$ && "$network" == "${project}_default" && "$name" == "/$expected_name" ]] || {
    echo 'Refusing foreign plugin sidecar selection' >&2; exit 1;
  }
done
# mapfile (not `read -a`): docker ps -aq emits one ID per line and read would
# only capture the first sidecar, leaking the rest on teardown.
mapfile -t sidecar_ids <<< "$sidecars"
(( ${#sidecar_ids[@]} == 0 )) || docker rm -f "${sidecar_ids[@]}"
docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml" down -v
validate_ci_runtime "$project" "$runtime"
chmod -R u+rwx,go-rwx -- "$runtime"
rm -rf --one-file-system -- "$runtime"
[[ ! -e "$runtime" ]] || { echo 'Runtime directory survived teardown' >&2; exit 1; }
