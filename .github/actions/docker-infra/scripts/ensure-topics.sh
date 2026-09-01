#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root=$(cd -- "$script_dir/../../../.." && pwd)
source "$script_dir/ci-runtime-path.sh"
export CI_RUNTIME_SCOPE="$(bash "$script_dir/ci-runtime-scope.sh" "$project")"
validate_ci_runtime "$project" "$runtime"
mapfile -t _overlay_files < <(ci_compose_overlay_files "$root")
compose=(docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml" ${_overlay_files[@]/#/-f})
container=$("${compose[@]}" ps -q redpanda)
[[ -n "$container" ]] || { echo 'Redpanda is not running' >&2; exit 1; }
[[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container") == "$project" ]] || {
  echo 'Redpanda does not belong to the requested CI project' >&2; exit 1;
}
ensure_topic() {
  local topic=$1 retention=$2
  if ! "${compose[@]}" exec -T redpanda rpk topic describe "$topic" --brokers redpanda:9092 >/dev/null 2>&1; then
    "${compose[@]}" exec -T redpanda rpk topic create "$topic" --brokers redpanda:9092 --partitions 1 --replicas 1
  fi
  "${compose[@]}" exec -T redpanda rpk topic alter-config "$topic" --set "retention.ms=$retention" --brokers redpanda:9092
}
# Core domain topics (mirror CORE_TOPICS in
# services/core-api/src/modules/plugin/events/consumer-topic-patterns.ts) plus
# the tenant/user/plugin aggregate buses. Pre-creating them here is REQUIRED:
# a plugin consumer subscribing to e.g. plexica.workspace.created cannot get a
# Kafka assignment until the topic exists, and with auto-creation disabled on
# the consumer path the install would time out (PLUGIN_CONSUMER_START degraded)
# when the first install lands before the first workspace event.
for topic in \
  plexica.workspace.created plexica.workspace.updated plexica.workspace.deleted \
  plexica.user.invited plexica.user.joined plexica.user.removed \
  plexica.tenant.created plexica.tenant.suspended plexica.tenant.deleted \
  plexica.plugin.installed plexica.plugin.activated plexica.plugin.deactivated \
  plexica.plugin.uninstalled \
  plexica.tenant.events plexica.user.events plexica.plugin.events; do
  ensure_topic "$topic" 604800000
done
ensure_topic plexica.plugin.dlq 2592000000
