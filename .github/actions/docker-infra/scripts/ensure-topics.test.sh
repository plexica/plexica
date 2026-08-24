#!/usr/bin/env bash
set -euo pipefail

dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
project=plexica-ci-topics-123456
runtime=$(RUNNER_TEMP="$temp" bash "$dir/ci-runtime-env.sh" init "$project")
mkdir "$temp/bin"
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *' ps -q redpanda'*) printf 'redpanda-id\n' ;;
  *'inspect --format'*) printf '%s\n' "${TOPIC_LABEL:-plexica-ci-topics-123456}" ;;
  *' exec -T redpanda rpk '*)
    if [[ -n "${RPK_FAIL:-}" ]]; then exit 7; fi
    cmd=$*
    cmd=${cmd##*exec -T redpanda rpk }
    case "$cmd" in
      'topic describe '*)
        topic=${cmd##*topic describe }; topic=${topic%% *}
        grep -Fqx "$topic" "$TOPIC_STATE" ;;
      'topic create '*)
        topic=${cmd##*topic create }; topic=${topic%% *}
        printf '%s\n' "$topic" >> "$TOPIC_STATE"; printf '%s\n' "$*" >> "$TOPIC_LOG" ;;
      'topic alter-config '*) printf '%s\n' "$*" >> "$TOPIC_LOG" ;;
      *) exit 1 ;;
    esac ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$temp/bin/docker"
run() {
  PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp" TOPIC_LOG="$temp/topics.log" TOPIC_STATE="$temp/topics.state" \
    CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$dir/ensure-topics.sh"
}
: > "$temp/topics.state"
run
grep -F -- '--project-name plexica-ci-topics-123456' "$temp/topics.log" >/dev/null
[[ $(wc -l < "$temp/topics.state") -eq 4 ]]
[[ $(grep -Fc 'retention.ms=604800000' "$temp/topics.log") -eq 3 ]]
grep -F -- 'plexica.plugin.dlq --brokers redpanda:9092 --partitions 1 --replicas 1' "$temp/topics.log" >/dev/null
grep -F -- 'retention.ms=2592000000' "$temp/topics.log" >/dev/null
cp "$temp/topics.state" "$temp/first-run.state"
run
cmp "$temp/first-run.state" "$temp/topics.state"
if RPK_FAIL=1 run; then
  echo 'Accepted a genuine rpk failure' >&2; exit 1
fi
if TOPIC_LABEL=plexica-ci-foreign-123456 PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$dir/ensure-topics.sh"; then
  echo 'Accepted a Redpanda container from another project' >&2; exit 1
fi
if RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$temp/missing" bash "$dir/ensure-topics.sh"; then
  echo 'Accepted a missing runtime directory' >&2; exit 1
fi
