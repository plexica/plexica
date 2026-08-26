#!/bin/sh
set -eu

contract=${REDPANDA_LISTENER_CONTRACT:-/run/plexica-ci/redpanda-listener.env}
# Park while the contract is absent or still being written (no value yet):
# the container must stay RUNNING so Docker allocates the published dynamic
# port and `docker compose port` can resolve it before staging completes.
# A present-but-malformed value fails closed immediately.
i=0
while :; do
  value=''
  [ -r "$contract" ] && { . "$contract"; value=${REDPANDA_EXTERNAL_LISTENER:-}; }
  case "$value" in
    127.0.0.1:[1-9][0-9]*) break ;;
    '') : ;;
    *) echo 'Invalid Redpanda external listener contract' >&2; exit 1 ;;
  esac
  [ "$i" -lt "${REDPANDA_PARK_TIMEOUT_SECONDS:-300}" ] || {
    echo 'Timed out waiting for the Redpanda listener contract' >&2; exit 1;
  }
  i=$((i + 1))
  sleep "${REDPANDA_PARK_INTERVAL_SECONDS:-2}"
done

# The pinned image runs redpanda through rpk (the image entrypoint execs
# rpk); the raw binary rejects rpk-level flags such as --set.
exec rpk redpanda start \
  --smp 1 --memory 256M --overprovisioned \
  --set redpanda.developer_mode=true \
  --kafka-addr PLAINTEXT://0.0.0.0:9092,OUTSIDE://0.0.0.0:19092 \
  --advertise-kafka-addr PLAINTEXT://redpanda:9092,OUTSIDE://"$REDPANDA_EXTERNAL_LISTENER" \
  --pandaproxy-addr 0.0.0.0:8082
